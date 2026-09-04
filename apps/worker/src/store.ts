import type { Vote, WorldDay } from '@mq/core';

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
 * 1日分の締めと、それが生む3つの帰結（翌日の行の追加、世界の進行度更新）を
 * 1トランザクションで行う。締めが実際に効いたかを返す。
 *
 * `db.batch` はD1では単一トランザクションとして実行されるため、途中で
 * 落ちても「締めたのに翌日が無い」「翌日はあるのに進行度が古い」といった
 * 半端な状態は残らない。
 *
 * 各文はそれぞれ自分の力で競合に強い：
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
): Promise<boolean> {
  const [closeResult] = await db.batch([
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
 * 招待を使用済みにするのと、プレイヤーを作るのを1トランザクションで行う。
 * `db.batch` はD1では単一トランザクションとして実行されるため、
 * どちらかが失敗しても中途半端な状態（招待だけ消費されてプレイヤーが無い等）は残らない。
 *
 * 招待の消費は `WHERE code_hash = ? AND used_by IS NULL` で守られているので、
 * 呼び出し前の読み取りと書き込みの間に他の誰かが同じコードを使っていれば0行更新になる。
 * 戻り値の false はまさにその競合を表す。
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
  ]);
  return (claimResult.meta.changes ?? 0) === 1;
}
