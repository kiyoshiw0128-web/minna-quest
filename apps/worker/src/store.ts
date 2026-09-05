import type { Character, JobId, JobProgress, Vote, WorldDay } from '@mq/core';

export type WorldRow = {
  readonly id: string;
  readonly name: string;
  readonly startedAt: string;
  readonly currentDay: number;
  readonly chapter: number;
  readonly tags: readonly string[];
};

export type PlayerRow = {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
};

type RawWorld = {
  id: string; name: string; started_at: string;
  current_day: number; chapter: number; tags: string;
};

type RawDay = {
  day_no: number; option_ids: string;
  chosen_id: string | null; counts: string | null; tiebroken: number | null;
};

function toWorld(raw: RawWorld): WorldRow {
  return {
    id: raw.id,
    name: raw.name,
    startedAt: raw.started_at,
    currentDay: raw.current_day,
    chapter: raw.chapter,
    tags: JSON.parse(raw.tags) as string[],
  };
}

function toDay(raw: RawDay): WorldDay {
  return {
    dayNo: raw.day_no,
    optionIds: JSON.parse(raw.option_ids) as string[],
    chosenId: raw.chosen_id,
    counts: raw.counts === null ? null : (JSON.parse(raw.counts) as Record<string, number>),
    tiebroken: raw.tiebroken === null ? null : raw.tiebroken === 1,
  };
}

export async function getWorld(db: D1Database, worldId: string): Promise<WorldRow | null> {
  const raw = await db
    .prepare('SELECT id, name, started_at, current_day, chapter, tags FROM worlds WHERE id = ?')
    .bind(worldId)
    .first<RawWorld>();
  return raw === null ? null : toWorld(raw);
}

export async function getDay(
  db: D1Database, worldId: string, dayNo: number,
): Promise<WorldDay | null> {
  const raw = await db
    .prepare(
      `SELECT day_no, option_ids, chosen_id, counts, tiebroken
         FROM world_days WHERE world_id = ? AND day_no = ?`,
    )
    .bind(worldId, dayNo)
    .first<RawDay>();
  return raw === null ? null : toDay(raw);
}

/** 締めていない日のうち、指定した日より前のものを古い順に返す。 */
export async function listOpenDaysBefore(
  db: D1Database, worldId: string, today: number,
): Promise<readonly WorldDay[]> {
  const result = await db
    .prepare(
      `SELECT day_no, option_ids, chosen_id, counts, tiebroken
         FROM world_days
        WHERE world_id = ? AND day_no < ? AND chosen_id IS NULL
        ORDER BY day_no ASC`,
    )
    .bind(worldId, today)
    .all<RawDay>();
  return result.results.map(toDay);
}

export async function listClosedDays(
  db: D1Database, worldId: string,
): Promise<readonly WorldDay[]> {
  const result = await db
    .prepare(
      `SELECT day_no, option_ids, chosen_id, counts, tiebroken
         FROM world_days
        WHERE world_id = ? AND chosen_id IS NOT NULL
        ORDER BY day_no ASC`,
    )
    .bind(worldId)
    .all<RawDay>();
  return result.results.map(toDay);
}

/**
 * 1日分の締めと、それが生む4つの帰結（金貨の配布、翌日の行の追加、世界の進行度更新）を
 * 1トランザクションで行う。締めが実際に効いたかを返す。
 *
 * `db.batch` はD1では単一トランザクションとして実行されるため、途中で
 * 落ちても「締めたのに翌日が無い」「翌日はあるのに進行度が古い」といった
 * 半端な状態は残らない。
 *
 * 各文はそれぞれ自分の力で競合に強い：
 * - 金貨の配布: `EXISTS (... WHERE ... AND chosen_id IS NULL)` を締めの文より前に置き、
 *   締める前の状態（未締め）を条件にする。締めの文が chosen_id を埋めた後では
 *   このEXISTSは常にfalseになるので、二重に締めても二重に配れない。
 *   締めが冪等ならこの配布も自動的に冪等になる、という設計をそのままSQLに落としている。
 * - 締め: `WHERE ... AND chosen_id IS NULL` で二重締めを防ぐ。changes をそのまま返り値にする。
 * - 翌日の挿入: `ON CONFLICT (world_id, day_no) DO NOTHING` で、負けた側が
 *   勝者の挿入済み行にぶつかってバッチ全体を失敗させない。
 * - 進行度の更新: `WHERE id = ? AND current_day = ?` で、締めようとしている日から
 *   進める場合だけ効かせる。負けた側は勝者がすでに current_day を進めているので
 *   0行になり、勝者のフラグを上書きできない。
 */
export async function advanceDay(
  db: D1Database,
  worldId: string,
  closedDay: WorldDay,
  closedAt: string,
  nextDay: WorldDay,
  progress: { fromDay: number; currentDay: number; chapter: number; tags: readonly string[] },
  goldAward = 0,
): Promise<boolean> {
  const [, closeResult] = await db.batch([
    db
      .prepare(
        `UPDATE players SET gold = gold + ?
          WHERE world_id = ?
            AND EXISTS (
              SELECT 1 FROM world_days
               WHERE world_id = ? AND day_no = ? AND chosen_id IS NULL
            )`,
      )
      .bind(goldAward, worldId, worldId, closedDay.dayNo),
    db
      .prepare(
        `UPDATE world_days
            SET chosen_id = ?, counts = ?, tiebroken = ?, closed_at = ?
          WHERE world_id = ? AND day_no = ? AND chosen_id IS NULL`,
      )
      .bind(
        closedDay.chosenId, JSON.stringify(closedDay.counts), closedDay.tiebroken === true ? 1 : 0,
        closedAt, worldId, closedDay.dayNo,
      ),
    db
      .prepare(
        `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id, counts, tiebroken)
         VALUES (?, ?, ?, NULL, NULL, NULL)
         ON CONFLICT (world_id, day_no) DO NOTHING`,
      )
      .bind(worldId, nextDay.dayNo, JSON.stringify(nextDay.optionIds)),
    db
      .prepare(
        `UPDATE worlds SET current_day = ?, chapter = ?, tags = ?
          WHERE id = ? AND current_day = ?`,
      )
      .bind(progress.currentDay, progress.chapter, JSON.stringify(progress.tags), worldId, progress.fromDay),
  ]);
  return (closeResult.meta.changes ?? 0) === 1;
}

export async function listVotes(
  db: D1Database, worldId: string, dayNo: number,
): Promise<readonly Vote[]> {
  const result = await db
    .prepare(
      'SELECT player_id, option_id FROM votes WHERE world_id = ? AND day_no = ? ORDER BY player_id',
    )
    .bind(worldId, dayNo)
    .all<{ player_id: string; option_id: string }>();
  return result.results.map((row) => ({ playerId: row.player_id, optionId: row.option_id }));
}

/**
 * 投票を入れる、または上書きする。書き込めたら true を返す。
 *
 * `SELECT ... WHERE chosen_id IS NULL` を条件に付けた `INSERT ... SELECT` にしているのは、
 * 「日が開いているか」の確認と書き込みの間に締めが割り込む TOCTOU を防ぐため。
 * ルート側の事前チェック（`day.chosenId !== null`）はあくまで安い早期リターンで、
 * 本当の可否はこの1文が締めと同じテーブル・同じ行を見て決める。
 * 締まっていれば0行になり、投票は残らない。
 */
export async function upsertVote(
  db: D1Database, worldId: string, dayNo: number,
  playerId: string, optionId: string, votedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO votes (world_id, day_no, player_id, option_id, voted_at)
       SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM world_days
           WHERE world_id = ? AND day_no = ? AND chosen_id IS NULL
        )
       ON CONFLICT (world_id, day_no, player_id)
       DO UPDATE SET option_id = excluded.option_id, voted_at = excluded.voted_at`,
    )
    .bind(worldId, dayNo, playerId, optionId, votedAt, worldId, dayNo)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

export async function findPlayerByTokenHash(
  db: D1Database, tokenHash: string,
): Promise<PlayerRow | null> {
  const raw = await db
    .prepare('SELECT id, world_id, name FROM players WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ id: string; world_id: string; name: string }>();
  return raw === null ? null : { id: raw.id, worldId: raw.world_id, name: raw.name };
}

export async function insertPlayer(
  db: D1Database,
  player: { id: string; worldId: string; name: string; tokenHash: string; joinedAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(player.id, player.worldId, player.name, player.tokenHash, player.joinedAt)
    .run();
}

/**
 * 招待が未使用のまま存在するかを確認し、所属する世界のIDを返す。
 * 存在しない・すでに使用済みなら null。この時点では何も変更しない。
 */
export async function findUnusedInviteWorldId(
  db: D1Database, codeHash: string,
): Promise<string | null> {
  const result = await db
    .prepare('SELECT world_id FROM invites WHERE code_hash = ? AND used_by IS NULL')
    .bind(codeHash)
    .first<{ world_id: string }>();
  return result === null ? null : result.world_id;
}

/**
 * Character を新規に挿入するための文を組み立てる。
 * jobs / learnedSkills / learnedPassives は数が可変なので、呼び出し側が
 * 組み立てるバッチにそのまま展開できるよう配列で返す（1つの prepare にまとめられない）。
 *
 * 挿入対象はすべて新規の character_id を前提にした無条件の INSERT。
 * 競合を気にしなければならないのは呼び出し側（雇用の金貨・枠のガード）の役目で、
 * ここでは「渡された Character をそのまま行に落とす」ことだけに専念する。
 */
function characterInsertStatements(
  db: D1Database, character: Character, playerId: string, isHero: boolean,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO characters
           (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive, is_hero)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        character.id, playerId, character.name, character.adventureLevel, character.adventureExp,
        JSON.stringify(character.aptitude), character.currentJob,
        JSON.stringify(character.equippedActive), JSON.stringify(character.equippedPassive),
        isHero ? 1 : 0,
      ),
    ...Object.entries(character.jobs).map(([jobId, progress]) =>
      db
        .prepare('INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, ?, ?, ?)')
        .bind(character.id, jobId, progress.level, progress.exp),
    ),
    ...character.learnedSkills.map((skillId) =>
      db.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', ?)`).bind(character.id, skillId),
    ),
    ...character.learnedPassives.map((passiveId) =>
      db.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'passive', ?)`).bind(character.id, passiveId),
    ),
  ];
}

/**
 * 招待を使用済みにするのと、プレイヤーを作るのと、その主人公を1体作って
 * パーティ枠0に入れるのを1トランザクションで行う。
 * `db.batch` はD1では単一トランザクションとして実行されるため、
 * どれかが失敗しても中途半端な状態（招待だけ消費されてプレイヤーが無い、
 * プレイヤーはできたのに主人公が無い、等）は残らない。
 *
 * 招待の消費は `WHERE code_hash = ? AND used_by IS NULL` で守られているので、
 * 呼び出し前の読み取りと書き込みの間に他の誰かが同じコードを使っていれば0行更新になる。
 * 戻り値の false はまさにその競合を表す。
 *
 * プレイヤー行・主人公の行は招待の消費が失敗しても無条件に作られる。
 * 既存のプレイヤー挿入がそうだったのと同じ理由で、そのプレイヤーの
 * トークンを誰も知らないので無害（呼び出し元は claimed=false を見て
 * そのままエラーを返し、トークンを漏らさない）。
 */
export async function claimInviteAndInsertPlayer(
  db: D1Database,
  params: {
    codeHash: string;
    playerId: string;
    worldId: string;
    name: string;
    tokenHash: string;
    usedAt: string;
    hero: Character;
  },
): Promise<boolean> {
  const [claimResult] = await db.batch([
    db
      .prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ? AND used_by IS NULL')
      .bind(params.playerId, params.usedAt, params.codeHash),
    db
      .prepare(
        `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(params.playerId, params.worldId, params.name, params.tokenHash, params.usedAt),
    ...characterInsertStatements(db, params.hero, params.playerId, true),
    db
      .prepare('INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, 0)')
      .bind(params.playerId, params.hero.id),
  ]);
  return (claimResult.meta.changes ?? 0) === 1;
}

type RawPartyCharacter = {
  id: string; name: string; adventure_level: number; adventure_exp: number;
  aptitude: string; current_job: string; equipped_active: string; equipped_passive: string;
};

/**
 * `IN (?, ?, ...)` 用のプレースホルダを要素数ぶん作る。0件のときは呼び出し側で
 * クエリ自体をスキップすること（空の IN 句はSQLとして書けない）。
 */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * パーティの並び順（slot昇順）で Character の配列を返す。戦闘（toPartyMember）も
 * 報酬の付与も、この並びと中身をそのまま使う。
 *
 * job_levels と learned は character_id の IN 句でまとめて引き、JS側で
 * キャラごとに組み立てる。パーティは最大4人なので、キャラの数だけ
 * 問い合わせを重ねるより見通しがよい。
 */
export async function getPartyCharacters(
  db: D1Database, playerId: string,
): Promise<readonly Character[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.adventure_level, c.adventure_exp, c.aptitude,
              c.current_job, c.equipped_active, c.equipped_passive
         FROM party p JOIN characters c ON c.id = p.character_id
        WHERE p.player_id = ?
        ORDER BY p.slot ASC`,
    )
    .bind(playerId)
    .all<RawPartyCharacter>();

  const ids = rows.results.map((row) => row.id);
  if (ids.length === 0) return [];

  const [jobRows, learnedRows] = await Promise.all([
    db
      .prepare(`SELECT character_id, job_id, level, exp FROM job_levels WHERE character_id IN (${placeholders(ids.length)})`)
      .bind(...ids)
      .all<{ character_id: string; job_id: string; level: number; exp: number }>(),
    db
      .prepare(`SELECT character_id, kind, id FROM learned WHERE character_id IN (${placeholders(ids.length)})`)
      .bind(...ids)
      .all<{ character_id: string; kind: string; id: string }>(),
  ]);

  return rows.results.map((row): Character => {
    const jobs: Record<string, JobProgress> = {};
    for (const job of jobRows.results) {
      if (job.character_id === row.id) jobs[job.job_id] = { level: job.level, exp: job.exp };
    }
    const learnedSkills: string[] = [];
    const learnedPassives: string[] = [];
    for (const learned of learnedRows.results) {
      if (learned.character_id !== row.id) continue;
      if (learned.kind === 'skill') learnedSkills.push(learned.id);
      else learnedPassives.push(learned.id);
    }
    return {
      id: row.id,
      name: row.name,
      adventureLevel: row.adventure_level,
      adventureExp: row.adventure_exp,
      aptitude: JSON.parse(row.aptitude) as Character['aptitude'],
      currentJob: row.current_job,
      jobs,
      learnedSkills,
      learnedPassives,
      equippedActive: JSON.parse(row.equipped_active) as string[],
      equippedPassive: JSON.parse(row.equipped_passive) as string[],
    };
  });
}

type RawSingleCharacter = RawPartyCharacter & { is_hero: number };

/**
 * 1体だけを、所有者チェック込みで読む。転職・装備の変更はどちらも
 * 「そのキャラが本当にこのプレイヤーのものか」をSQLの時点で確認する必要がある
 * （設計書 §8 テスト10）。WHERE に player_id を含めることで、他人のIDを渡されたら
 * この時点でnullになり、以降のcoreロジックにも書き込みにも進まない。
 *
 * パーティに入っているかどうかは問わない。解雇済みでもキャラの記録自体は
 * 残り続ける（設計書 §5）ので、転職・装備の対象からは外さない。
 */
export async function getCharacterForPlayer(
  db: D1Database, playerId: string, characterId: string,
): Promise<{ character: Character; isHero: boolean } | null> {
  const row = await db
    .prepare(
      `SELECT id, name, adventure_level, adventure_exp, aptitude,
              current_job, equipped_active, equipped_passive, is_hero
         FROM characters WHERE id = ? AND player_id = ?`,
    )
    .bind(characterId, playerId)
    .first<RawSingleCharacter>();
  if (row === null) return null;

  const [jobRows, learnedRows] = await Promise.all([
    db
      .prepare('SELECT job_id, level, exp FROM job_levels WHERE character_id = ?')
      .bind(characterId)
      .all<{ job_id: string; level: number; exp: number }>(),
    db
      .prepare('SELECT kind, id FROM learned WHERE character_id = ?')
      .bind(characterId)
      .all<{ kind: string; id: string }>(),
  ]);

  const jobs: Record<string, JobProgress> = {};
  for (const job of jobRows.results) jobs[job.job_id] = { level: job.level, exp: job.exp };

  const learnedSkills: string[] = [];
  const learnedPassives: string[] = [];
  for (const learned of learnedRows.results) {
    if (learned.kind === 'skill') learnedSkills.push(learned.id);
    else learnedPassives.push(learned.id);
  }

  const character: Character = {
    id: row.id,
    name: row.name,
    adventureLevel: row.adventure_level,
    adventureExp: row.adventure_exp,
    aptitude: JSON.parse(row.aptitude) as Character['aptitude'],
    currentJob: row.current_job,
    jobs,
    learnedSkills,
    learnedPassives,
    equippedActive: JSON.parse(row.equipped_active) as string[],
    equippedPassive: JSON.parse(row.equipped_passive) as string[],
  };
  return { character, isHero: row.is_hero === 1 };
}

/**
 * 転職を1トランザクションで反映する。current_job の更新・（初めて就く職業なら）
 * job_levels の追加・新しく覚えた技/パッシブの追加をまとめて行う。
 *
 * 分けて書くと「currentJobだけ変わって技を1つも覚えていない」
 * 「job_levelsの行が無いのにcurrent_jobだけそれを指している」といった
 * 半端な状態が残りうる（招待の消費・日の締め・雇用と同じ理由）。
 *
 * 各文は `EXISTS (SELECT 1 FROM characters WHERE id = ? AND player_id = ?)` を
 * 個別に持つ。db.batch内の文は互いに独立して実行されるため、1文目の
 * WHERE条件が0行でも他の文は止まらない。ガードをコピーしておかないと
 * 「所有者チェックに落ちたのに技だけ追加される」事故になる。
 */
export async function changeCharacterJob(
  db: D1Database,
  params: {
    characterId: string;
    playerId: string;
    jobId: JobId;
    newJobLevel: JobProgress | null;
    newSkillIds: readonly string[];
    newPassiveIds: readonly string[];
  },
): Promise<boolean> {
  const { characterId, playerId, jobId, newJobLevel, newSkillIds, newPassiveIds } = params;
  const OWNED = 'EXISTS (SELECT 1 FROM characters WHERE id = ? AND player_id = ?)';
  const ownedBind = (): [string, string] => [characterId, playerId];

  const statements: D1PreparedStatement[] = [
    db
      .prepare('UPDATE characters SET current_job = ? WHERE id = ? AND player_id = ?')
      .bind(jobId, characterId, playerId),
    ...(newJobLevel === null
      ? []
      : [
          db
            .prepare(
              `INSERT INTO job_levels (character_id, job_id, level, exp)
               SELECT ?, ?, ?, ? WHERE ${OWNED}`,
            )
            .bind(characterId, jobId, newJobLevel.level, newJobLevel.exp, ...ownedBind()),
        ]),
    ...newSkillIds.map((skillId) =>
      db
        .prepare(
          `INSERT INTO learned (character_id, kind, id)
           SELECT ?, 'skill', ? WHERE ${OWNED}
           ON CONFLICT (character_id, kind, id) DO NOTHING`,
        )
        .bind(characterId, skillId, ...ownedBind()),
    ),
    ...newPassiveIds.map((passiveId) =>
      db
        .prepare(
          `INSERT INTO learned (character_id, kind, id)
           SELECT ?, 'passive', ? WHERE ${OWNED}
           ON CONFLICT (character_id, kind, id) DO NOTHING`,
        )
        .bind(characterId, passiveId, ...ownedBind()),
    ),
  ];

  const [updateResult] = await db.batch(statements);
  return (updateResult.meta.changes ?? 0) === 1;
}

/**
 * アクティブ・パッシブの装備枠を1文でまとめて書き換える。
 * 2文に分けないのは、片方だけ検証に通った状態でDBに反映されるのを防ぐため
 * （設計書 §8 テスト8）。判定自体はルート側がcoreの関数で済ませてから呼ぶので、
 * ここは1行のUPDATEで足りる。
 */
export async function setEquipment(
  db: D1Database,
  playerId: string,
  characterId: string,
  activeIds: readonly string[],
  passiveIds: readonly string[],
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE characters SET equipped_active = ?, equipped_passive = ?
        WHERE id = ? AND player_id = ?`,
    )
    .bind(JSON.stringify(activeIds), JSON.stringify(passiveIds), characterId, playerId)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

/**
 * そのプレイヤーが持つ全キャラ（パーティ外・解雇済みも含む）のIDと
 * 主人公フラグ。並べ替えの検証（自分のキャラだけか・主人公が入っているか）を
 * JS側で行うために使う。
 */
export async function getOwnedCharacterFlags(
  db: D1Database, playerId: string,
): Promise<ReadonlyMap<string, boolean>> {
  const rows = await db
    .prepare('SELECT id, is_hero FROM characters WHERE player_id = ?')
    .bind(playerId)
    .all<{ id: string; is_hero: number }>();
  return new Map(rows.results.map((row) => [row.id, row.is_hero === 1]));
}

/**
 * パーティの並びをまるごと置き換える。検証済みの `order` をそのままslotに
 * 落とすだけで、DELETE→INSERTを1バッチに収めて片方だけ効く事故を防ぐ。
 *
 * 各INSERTにも所有者の存在確認を付けておくのは、JS側の事前検証と書き込みの
 * 間に解雇などが割り込むTOCTOUを塞ぐため（hireRecruitの空き枠探しと同じ考え方）。
 * 検証済みの件数だけ変更されなければ、呼び出し側にfalseを返して失敗を伝える。
 */
export async function setPartyOrder(
  db: D1Database, playerId: string, order: readonly string[],
): Promise<boolean> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM party WHERE player_id = ?').bind(playerId),
    ...order.map((characterId, slot) =>
      db
        .prepare(
          `INSERT INTO party (player_id, character_id, slot)
           SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND player_id = ?)`,
        )
        .bind(playerId, characterId, slot, characterId, playerId),
    ),
  ];

  const results = await db.batch(statements);
  const inserted = results.slice(1).reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
  return inserted === order.length;
}

/**
 * 雇用メンバーをパーティから外す。characters行そのものは消さない
 * （設計書 §5：過去の戦闘記録から参照できなくなるため）。
 *
 * `is_hero = 0` をWHEREに含めることで、主人公のIDが渡されても
 * この1文だけで弾ける（ルート側の事前チェックと二重に守る）。
 */
export async function dismissFromParty(
  db: D1Database, playerId: string, characterId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM party WHERE player_id = ? AND character_id = ?
        AND EXISTS (
          SELECT 1 FROM characters WHERE id = ? AND player_id = ? AND is_hero = 0
        )`,
    )
    .bind(playerId, characterId, characterId, playerId)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

/** その日の戦闘に最初に勝ったプレイヤーのID。誰も勝っていなければ null（設計書 §6.3）。 */
export async function getDefeatedBy(
  db: D1Database, worldId: string, dayNo: number,
): Promise<string | null> {
  const raw = await db
    .prepare('SELECT defeated_by FROM world_days WHERE world_id = ? AND day_no = ?')
    .bind(worldId, dayNo)
    .first<{ defeated_by: string | null }>();
  return raw?.defeated_by ?? null;
}

export type BattleResultRow = { result: string; rewardedAt: string };

/** そのプレイヤーのその日の戦闘結果。記録が無ければ null（=まだ勝っていない）。 */
export async function getBattleResult(
  db: D1Database, worldId: string, dayNo: number, playerId: string,
): Promise<BattleResultRow | null> {
  const raw = await db
    .prepare(
      'SELECT result, rewarded_at FROM battle_results WHERE world_id = ? AND day_no = ? AND player_id = ?',
    )
    .bind(worldId, dayNo, playerId)
    .first<{ result: string; rewarded_at: string }>();
  return raw === null ? null : { result: raw.result, rewardedAt: raw.rewarded_at };
}

export type BattleRewardCharacter = {
  characterId: string;
  jobId: string;
  adventureLevel: number;
  adventureExp: number;
  jobLevel: number;
  jobExp: number;
  newSkillIds: readonly string[];
  newPassiveIds: readonly string[];
};

/**
 * 戦闘勝利の後始末を1トランザクションで行う：報酬の付与（金貨・経験値・新規習得）、
 * battle_results への記録、世界としての討伐フラグの更新（設計書 §6.3 / §6.4）。
 * 分けて書くと「経験値だけ入って記録が残らない」「記録は残ったのに金貨が
 * 入っていない」といった半端な状態が起こりうる。過去に同種の穴が2回見つかっている
 * （招待の消費・日の締め）ので、ここでも同じ形にする。
 *
 * 報酬系の文（金貨・冒険レベル/経験値・ジョブレベル/経験値・新規習得）はすべて
 * `NOT EXISTS (SELECT 1 FROM battle_results WHERE world_id=? AND day_no=? AND player_id=?)`
 * をガードに持つ。battle_results への INSERT はバッチの最後の方に置くので、
 * これらのガードはどの報酬文からも「まだこの日のこのプレイヤーの勝利が
 * 記録されていない、バッチ開始時点の状態」を見る
 * （advanceDay の金貨配布が締めの文より前に置いた EXISTS で締め前の状態を
 * 見るのと同じ考え方）。
 *
 * したがって、このプレイヤーがこの日すでに報酬を受け取っていれば、
 * 呼び出し側が計算した「新しいレベル・経験値」をそのまま渡しても、
 * これらの文はすべて0行のまま何も変えない。二度目の報酬が入り込む
 * 余地はSQLの側でふさがれている。
 *
 * world_days.defeated_by の更新はこれとは独立したガード（IS NULL）。
 * 報酬をすでに受け取ったプレイヤーが再度勝っても、世界の討伐フラグ自体は
 * 「まだ誰も倒していなければ」自分のIDで埋まる。2人が同じ日に勝っても、
 * 先に書き込めた方だけがここで1行更新を取り、もう片方は0行のまま変わらない。
 */
export async function recordBattleWin(
  db: D1Database,
  params: {
    worldId: string;
    dayNo: number;
    playerId: string;
    rewardedAt: string;
    goldAward: number;
    party: readonly BattleRewardCharacter[];
  },
): Promise<{ rewarded: boolean; defeated: boolean }> {
  const { worldId, dayNo, playerId, rewardedAt, goldAward, party } = params;

  const NOT_REWARDED_YET =
    'NOT EXISTS (SELECT 1 FROM battle_results WHERE world_id = ? AND day_no = ? AND player_id = ?)';
  const guardBind = (): [string, number, string] => [worldId, dayNo, playerId];

  const statements: D1PreparedStatement[] = [
    db
      .prepare(`UPDATE players SET gold = gold + ? WHERE id = ? AND ${NOT_REWARDED_YET}`)
      .bind(goldAward, playerId, ...guardBind()),
    ...party.flatMap((member) => [
      db
        .prepare(
          `UPDATE characters SET adventure_level = ?, adventure_exp = ?
            WHERE id = ? AND ${NOT_REWARDED_YET}`,
        )
        .bind(member.adventureLevel, member.adventureExp, member.characterId, ...guardBind()),
      db
        .prepare(
          `UPDATE job_levels SET level = ?, exp = ?
            WHERE character_id = ? AND job_id = ? AND ${NOT_REWARDED_YET}`,
        )
        .bind(member.jobLevel, member.jobExp, member.characterId, member.jobId, ...guardBind()),
      ...member.newSkillIds.map((skillId) =>
        db
          .prepare(
            `INSERT INTO learned (character_id, kind, id)
             SELECT ?, 'skill', ? WHERE ${NOT_REWARDED_YET}
             ON CONFLICT (character_id, kind, id) DO NOTHING`,
          )
          .bind(member.characterId, skillId, ...guardBind()),
      ),
      ...member.newPassiveIds.map((passiveId) =>
        db
          .prepare(
            `INSERT INTO learned (character_id, kind, id)
             SELECT ?, 'passive', ? WHERE ${NOT_REWARDED_YET}
             ON CONFLICT (character_id, kind, id) DO NOTHING`,
          )
          .bind(member.characterId, passiveId, ...guardBind()),
      ),
    ]),
    db
      .prepare(
        `INSERT INTO battle_results (world_id, day_no, player_id, result, rewarded_at)
         SELECT ?, ?, ?, 'win', ? WHERE ${NOT_REWARDED_YET}`,
      )
      .bind(worldId, dayNo, playerId, rewardedAt, ...guardBind()),
    db
      .prepare(
        `UPDATE world_days SET defeated_by = ?
          WHERE world_id = ? AND day_no = ? AND defeated_by IS NULL`,
      )
      .bind(playerId, worldId, dayNo),
  ];

  const results = await db.batch(statements);
  const rewardResult = results[results.length - 2];
  const defeatedResult = results[results.length - 1];
  return {
    rewarded: (rewardResult.meta.changes ?? 0) === 1,
    defeated: (defeatedResult.meta.changes ?? 0) === 1,
  };
}

export async function getPlayerGold(db: D1Database, playerId: string): Promise<number | null> {
  const raw = await db.prepare('SELECT gold FROM players WHERE id = ?').bind(playerId).first<{ gold: number }>();
  return raw === null ? null : raw.gold;
}

export async function getPartySize(db: D1Database, playerId: string): Promise<number> {
  const raw = await db
    .prepare('SELECT COUNT(*) AS n FROM party WHERE player_id = ?')
    .bind(playerId)
    .first<{ n: number }>();
  return raw?.n ?? 0;
}

/** パーティの枠は0〜3の4つ。 */
const PARTY_SLOTS = 4;

/**
 * 雇用を1トランザクションで行う。金貨の減算と characters/job_levels/learned/party
 * への挿入を分けると、「金だけ減って仲間が増えない」事故が起きる（設計書 §5）。
 *
 * characters の挿入そのものに「今この瞬間、金貨が足りているか」「パーティに
 * 空きがあるか」の両方をガードとして持たせている。このSELECTはバッチの最初の
 * 文なので、他のどの文にもまだ触れられていない状態（呼び出し前と同じ状態）を見る。
 * 以降の文（job_levels・learned・party・金貨の減算）はすべて
 * 「その character_id が存在するか」だけを条件にしているので、
 * 最初の挿入が0行だった場合は連鎖してすべて0行になり、何も変わらない。
 *
 * パーティの空き枠探しは `NOT EXISTS` で0〜3のうち埋まっていない最小の枠を選ぶ。
 * (player_id, slot) が主キーなので、同じ枠に2人入る事故はDBの制約自体が防ぐ。
 */
export async function hireRecruit(
  db: D1Database,
  params: { playerId: string; cost: number; character: Character },
): Promise<boolean> {
  const { playerId, cost, character } = params;

  const [charResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO characters
           (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT gold FROM players WHERE id = ?) >= ?
            AND (SELECT COUNT(*) FROM party WHERE player_id = ?) < ${PARTY_SLOTS}`,
      )
      .bind(
        character.id, playerId, character.name, character.adventureLevel, character.adventureExp,
        JSON.stringify(character.aptitude), character.currentJob,
        JSON.stringify(character.equippedActive), JSON.stringify(character.equippedPassive),
        playerId, cost, playerId,
      ),
    ...Object.entries(character.jobs).map(([jobId, progress]) =>
      db
        .prepare(
          `INSERT INTO job_levels (character_id, job_id, level, exp)
           SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ?)`,
        )
        .bind(character.id, jobId, progress.level, progress.exp, character.id),
    ),
    ...character.learnedSkills.map((skillId) =>
      db
        .prepare(
          `INSERT INTO learned (character_id, kind, id)
           SELECT ?, 'skill', ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ?)`,
        )
        .bind(character.id, skillId, character.id),
    ),
    ...character.learnedPassives.map((passiveId) =>
      db
        .prepare(
          `INSERT INTO learned (character_id, kind, id)
           SELECT ?, 'passive', ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ?)`,
        )
        .bind(character.id, passiveId, character.id),
    ),
    db
      .prepare(
        `INSERT INTO party (player_id, character_id, slot)
         SELECT ?, ?, s.slot
           FROM (SELECT 0 AS slot UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) s
          WHERE EXISTS (SELECT 1 FROM characters WHERE id = ?)
            AND NOT EXISTS (SELECT 1 FROM party WHERE player_id = ? AND slot = s.slot)
          ORDER BY s.slot LIMIT 1`,
      )
      .bind(playerId, character.id, character.id, playerId),
    db
      .prepare(
        `UPDATE players SET gold = gold - ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM characters WHERE id = ?)`,
      )
      .bind(cost, playerId, character.id),
  ]);
  return (charResult.meta.changes ?? 0) === 1;
}
