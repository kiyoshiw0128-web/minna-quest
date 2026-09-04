import { JOBS, NAMES, rollRecruits, tavernSeed } from '@mq/core';
import type { Recruit } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { getWorld } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

/**
 * 酒場に並ぶ人材の冒険Lv上限。上限が無いと稀に序盤では到底払えない
 * 高レベルの人材しか出ない日ができてしまう。戦闘のバランス値ではなく
 * 「酒場に何が並ぶか」だけの値なので、マスタ（packages/core）ではなく
 * ここに置く。
 */
const TAVERN_MAX_LEVEL = 15;

/** 酒場には基本職だけを並べる。上級職は転職でしか就けない設計（設計書 §4.3）のため。 */
const BASIC_JOB_IDS = Object.values(JOBS)
  .filter((job) => job.tier === 'basic')
  .map((job) => job.id);

/**
 * その世界・その日の酒場の顔ぶれ。シードが世界IDと日数だけで決まるので、
 * 誰がいつ呼んでも同じ3人になる（全員が同じ3人を見る）。
 * tavern.ts と hire.ts の両方から呼ぶので、ここに置いて重複させない。
 */
export function todaysRecruits(worldId: string, dayNo: number): readonly Recruit[] {
  return rollRecruits(tavernSeed(worldId, dayNo), `${worldId}:${dayNo}`, NAMES, BASIC_JOB_IDS, TAVERN_MAX_LEVEL);
}

export async function handleTavern(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  return ok({ dayNo: world.currentDay, recruits: todaysRecruits(world.id, world.currentDay) });
}
