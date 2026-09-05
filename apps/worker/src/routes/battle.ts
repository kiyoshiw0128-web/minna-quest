import {
  BATTLE_REWARDS, ENEMIES, EVENTS, JOBS, PASSIVES, SKILLS, gainExp, simulate, toPartyMember,
} from '@mq/core';
import type { BattlePlan, Character, DailyEvent, Enemy, Job } from '@mq/core';
import { requirePlayer } from '../auth.js';
import {
  getBattleResult, getDefeatedBy, getDay, getPartyCharacters, getWorld, recordBattleWin,
} from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

const POOL: readonly DailyEvent[] = Object.values(EVENTS);
const ENEMY_TABLE: Readonly<Record<string, Enemy>> = ENEMIES;

/**
 * その日確定した選択肢が戦闘なら敵を返す。締まっていない日・戦闘でない日は
 * null（設計書 §6.1 / §6.2）。
 */
function resolveBattleEnemy(chosenId: string | null): Enemy | null {
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

export async function handleGetBattle(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const day = await getDay(env.DB, world.id, world.currentDay);
  if (day === null) return fail('day not found', 404);

  const enemy = resolveBattleEnemy(day.chosenId);
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

type BattleBody = { plan?: unknown };

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

  const day = await getDay(env.DB, world.id, world.currentDay);
  if (day === null) return fail('day not found', 404);

  const enemy = resolveBattleEnemy(day.chosenId);
  if (enemy === null) return fail('no battle today');

  const characters = await getPartyCharacters(env.DB, player.id);
  const partyMembers = characters.map((character) => toPartyMember(character, jobOf(character), SKILLS, PASSIVES));

  // クライアントは計算しない。core は決定論なので、同じプランからは
  // 必ず同じログが出る（設計書 §6.2）。
  const log = simulate(partyMembers, enemy, plan);

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
