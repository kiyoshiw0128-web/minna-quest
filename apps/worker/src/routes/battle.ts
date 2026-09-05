import {
  BATTLE_REWARDS, ENEMIES, EVENTS, JOBS, PASSIVES, SKILLS, bossForChapter, chapterOf, gainExp,
  isBossDay, simulate, toPartyMember,
} from '@mq/core';
import type { BattlePlan, Character, DailyEvent, Enemy, Job } from '@mq/core';
import { requirePlayer } from '../auth.js';
import {
  getActivePetId, getBattleResult, getDefeatedBy, getDay, getPartyCharacters, getWorld, recordBattleWin,
} from '../store.js';
import { activePetEffects } from '../petEffects.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

const POOL: readonly DailyEvent[] = Object.values(EVENTS);
const ENEMY_TABLE: Readonly<Record<string, Enemy>> = ENEMIES;

/**
 * その日確定した選択肢が戦闘なら敵を返す。締まっていない日・戦闘でない日は
 * null（設計書 §6.1 / §6.2）。
 */
/**
 * その日の相手を決める。
 *
 * **7日ごとのボスの日は、投票の結果より章ボスが優先する。** 全体設計 §5.5 が
 * 「7日ごとに章ボス。ボスは全員共通」と定めているため、その日に何を選んでいても
 * 立ちはだかるのはボスである。ここを通さないとボスが一度も出てこない
 * （実際、雑魚敵を足してイベントの割り当てを変えた際に、バルゴスがどの
 * イベントからも参照されなくなり、完全に到達不能になっていた）。
 *
 * その章のボスが未作成なら、ボスの日でも通常のイベントで進む。存在しない章に
 * 別の章のボスを流用すると、難易度も物語も合わないものが出てくる。
 */
function resolveBattleEnemy(chosenId: string | null, dayNo: number): Enemy | null {
  if (isBossDay(dayNo)) {
    const boss = bossForChapter(chapterOf(dayNo));
    if (boss !== null) return boss;
  }
  if (chosenId === null) return null;
  const event = POOL.find((candidate) => candidate.id === chosenId);
  if (event === undefined || event.kind !== 'battle' || event.enemyId === undefined) return null;
  return ENEMY_TABLE[event.enemyId] ?? null;
}

/**
 * currentJob に対応する Job を引く。データが揃っていれば必ず見つかる
 * （createCharacter/hireRecruit がその時点の JOBS から作っているため）。
 * 見つからないのはマスタと保存済みデータがずれている異常事態なので、
 * bridge.ts の toPartyMember 同様、黙って握りつぶさず投げる。
 */
function jobOf(character: Character): Job {
  const job = JOBS[character.currentJob as keyof typeof JOBS] as Job | undefined;
  if (job === undefined) throw new Error(`unknown job: ${character.currentJob}`);
  return job;
}

/**
 * 戦う日を決める。既定は「直近で締まった日」＝ `currentDay - 1`。
 *
 * `catchUp` は「今日より前の未締めの日」だけを締め、締めるたびに翌日の行を作って
 * `current_day` をそこへ進める。したがって `world.currentDay` の行は常に未締めで、
 * `chosen_id` は必ず NULL になる。当初この関数は `currentDay` を見ていたため、
 * 「その日の確定した選択肢が戦闘か」の判定が永久に偽になり、戦闘が一度も
 * 始まらない状態だった。DBに締め済みの `currentDay` を直接差し込むテストでは
 * 通ってしまい、実際には起こりえない状態を検査していた。
 *
 * 物語の側でもこれが正しい。プレイヤーが今日対処するのは「昨日の多数決で
 * 決まったこと」であり、全体設計 §5.1 の1日の流れがそう書いてある。
 *
 * **過去の日も指定できる。** 何日か開けてから戻ると `catchUp` が複数日を
 * まとめて締めるので、既定の1日だけを見ていると途中の戦闘が丸ごと飛ぶ。
 * 全体設計 §5.5 は、溜まった戦いを順に片付けて追いつけること（追体験）を
 * 明示しているので、締まった日であればどれでも挑めるようにする。
 *
 * 1日目は締まった日がまだ無いので、戦闘も無い。
 */
function resolveBattleDayNo(currentDay: number, requested: number | null): number | null {
  const latestClosed = currentDay - 1;
  if (latestClosed < 1) return null;
  if (requested === null) return latestClosed;
  // 未来の日と、まだ締まっていない今日は指定できない。締まっていない日には
  // 確定した選択肢が無く、戦う相手が決まらない。
  if (!Number.isInteger(requested) || requested < 1 || requested > latestClosed) return null;
  return requested;
}

/** クエリ・本文から日の指定を読む。数値でなければ「指定なし」として扱う。 */
function requestedDayNo(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export async function handleGetBattle(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const asked = requestedDayNo(new URL(request.url).searchParams.get('dayNo'));
  const dayNo = resolveBattleDayNo(world.currentDay, asked);
  if (dayNo === null) return ok({ dayNo: world.currentDay, hasBattle: false });

  const day = await getDay(env.DB, world.id, dayNo);
  if (day === null) return fail('day not found', 404);

  const enemy = resolveBattleEnemy(day.chosenId, day.dayNo);
  if (enemy === null) return ok({ dayNo: day.dayNo, hasBattle: false });

  const characters = await getPartyCharacters(env.DB, player.id);
  const party = characters.map((character) => toPartyMember(character, jobOf(character), SKILLS, PASSIVES));

  const [battleResult, defeatedBy] = await Promise.all([
    getBattleResult(env.DB, world.id, day.dayNo, player.id),
    getDefeatedBy(env.DB, world.id, day.dayNo),
  ]);

  return ok({
    dayNo: day.dayNo,
    hasBattle: true,
    // 敵の行動表をそのまま返す。事前セット式のパズルとして成立させる前提であり、
    // 隠すとプランを組めない（設計書 §6.1）。
    enemy,
    // 各人の実効ステータスと装備中の技。育成側の生データではなく、
    // 戦闘に持ち込む形（toPartyMember）そのままを返す。
    party,
    won: battleResult?.result === 'win',
    worldDefeated: defeatedBy !== null,
  });
}

type BattleBody = { plan?: unknown; dayNo?: unknown };

/**
 * リクエストの plan を BattlePlan の形（characterId -> (技ID|null)[]）に整える。
 * 技IDが本当にそのキャラのものかは見ない。それは core の simulate が
 * unknownSkill として記録する仕事であり、ここで弾くと設計書 §6.2 の
 * 「弾かずに記録する」という要求と衝突する。ここで見るのは構造だけ。
 */
function sanitizePlan(raw: unknown): BattlePlan | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const plan: BattlePlan = {};
  for (const [characterId, turns] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(turns)) return null;
    if (!turns.every((turn) => turn === null || typeof turn === 'string')) return null;
    plan[characterId] = turns as (string | null)[];
  }
  return plan;
}

export async function handlePostBattle(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: BattleBody;
  try {
    body = (await request.json()) as BattleBody;
  } catch {
    return fail('invalid JSON body');
  }

  const plan = sanitizePlan(body.plan);
  if (plan === null) return fail('plan must map characterId to a list of skillId|null');

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const dayNo = resolveBattleDayNo(world.currentDay, requestedDayNo(body.dayNo));
  if (dayNo === null) return fail('no battle today');

  const day = await getDay(env.DB, world.id, dayNo);
  if (day === null) return fail('day not found', 404);

  const enemy = resolveBattleEnemy(day.chosenId, day.dayNo);
  if (enemy === null) return fail('no battle today');

  const characters = await getPartyCharacters(env.DB, player.id);
  const partyMembers = characters.map((character) => toPartyMember(character, jobOf(character), SKILLS, PASSIVES));

  // 連れているペットの効果はパーティ全員にかかる（段階6・設計書 §6）。
  // toPartyMember はキャラ1人ぶんの組み立てなのでペットのことを知らず、
  // ここで simulate に別枠として渡す。連れていなければ空配列で、
  // 挙動は今までと完全に同じ（後方互換）。
  const activePetId = await getActivePetId(env.DB, player.id);

  // クライアントは計算しない。core は決定論なので、同じプランからは
  // 必ず同じログが出る（設計書 §6.2）。
  const log = simulate(partyMembers, enemy, plan, {
    initialEffects: activePetEffects(activePetId),
    // 魔物使いの技はペットを連れていないと使えない。渡し忘れると、
    // ペットを連れているのに技が空振りする戦闘になる。
    hasPet: activePetId !== null,
  });

  if (log.result !== 'win') {
    // 負けても罰は無く、挑戦の回数も記録しない（何度でも挑み直せる）。DBには何も残さない。
    return ok({ log, rewarded: false, worldDefeated: (await getDefeatedBy(env.DB, world.id, day.dayNo)) !== null });
  }

  const reward = BATTLE_REWARDS[enemy.id];
  if (reward === undefined) throw new Error(`no battle reward defined for enemy: ${enemy.id}`);

  const rewardedAt = new Date().toISOString();

  // 呼び出し時点のキャラの状態にそのまま経験値を乗せて、書き込む候補値を作る。
  // これを実際に書き込むかどうかは recordBattleWin 内のSQLガードが決める。
  // すでに報酬を受け取っていた場合、ここで計算した値は捨てられてDBは一切
  // 変わらない（何度呼んでも同じ入力から同じ無害な計算をするだけ）。
  const partyRewards = characters.map((character) => {
    const gained = gainExp(character, { adventure: reward.exp, job: reward.exp }, JOBS);
    const newSkillIds = gained.events
      .filter((event) => event.t === 'skillLearned')
      .map((event) => event.skillId);
    const newPassiveIds = gained.events
      .filter((event) => event.t === 'passiveLearned')
      .map((event) => event.passiveId);

    return {
      characterId: character.id,
      jobId: character.currentJob,
      adventureLevel: gained.character.adventureLevel,
      adventureExp: gained.character.adventureExp,
      jobLevel: gained.character.jobs[character.currentJob]?.level ?? 1,
      jobExp: gained.character.jobs[character.currentJob]?.exp ?? 0,
      newSkillIds,
      newPassiveIds,
    };
  });

  const { rewarded, defeated } = await recordBattleWin(env.DB, {
    worldId: world.id,
    dayNo: day.dayNo,
    playerId: player.id,
    rewardedAt,
    goldAward: reward.gold,
    party: partyRewards,
  });

  // defeated は「このリクエストで討伐フラグを立てたか」であり、世界がすでに
  // 討伐済みかどうか（誰かが先に倒していた）とは別物。応答には後者を出す。
  const worldDefeated = defeated || (await getDefeatedBy(env.DB, world.id, day.dayNo)) !== null;
  return ok({ log, rewarded, worldDefeated });
}
