import { adventureExpToNext, createCharacter, gainExp, JOBS, jobExpToNext } from '@mq/core';
import type { Character, Recruit } from '@mq/core';
import { randomToken, requirePlayer } from '../auth.js';
import { getPartySize, getPlayerGold, getWorld, hireRecruit } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';
import { todaysRecruits } from './tavern.js';

type HireBody = { recruitId?: unknown };

/** パーティの枠は主人公込みで最大4（設計書 §3.2）。 */
const MAX_PARTY_SIZE = 4;

/** 1からtargetLevelになるまでに必要な累計経験値。 */
function totalExpTo(targetLevel: number, expToNext: (level: number) => number): number {
  let total = 0;
  for (let level = 1; level < targetLevel; level++) total += expToNext(level);
  return total;
}

/**
 * 酒場の Recruit をそのまま characters に入れられる Character にする。
 *
 * Recruit は冒険Lvを持っており、値段（recruitCost）にもそれが織り込まれている。
 * ここでレベル1のまま作ると「高い金を払ったのに主人公と同じレベル1」になり、
 * 冒険Lvがコストに効いている意味が無くなる。そこで core の gainExp に
 * 必要経験値を丸ごと渡し、レベルアップと途中の技の習得を core 側の
 * ロジックにそのまま解決させる（サーバ側で個別に計算しない）。
 *
 * ジョブLvは酒場の情報に無いので、冒険Lvと同じ数値まで進めておく。
 * 装備枠は createCharacter が作った初期状態のまま（レベルアップで新しく
 * 覚えた技は習得済みにはなるが、装備には自動で入らない）。装備の付け替えは
 * 段階3dのAPIの仕事。
 */
function buildRecruitCharacter(id: string, recruit: Recruit): Character {
  const base = createCharacter({ id, name: recruit.name, aptitude: recruit.aptitude, job: recruit.jobId }, JOBS);
  if (recruit.adventureLevel <= 1) return base;

  const adventure = totalExpTo(recruit.adventureLevel, adventureExpToNext);
  const job = totalExpTo(recruit.adventureLevel, jobExpToNext);
  return gainExp(base, { adventure, job }, JOBS).character;
}

export async function handleHire(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: HireBody;
  try {
    body = (await request.json()) as HireBody;
  } catch {
    return fail('invalid JSON body');
  }

  const recruitId = typeof body.recruitId === 'string' ? body.recruitId : '';
  if (recruitId === '') return fail('recruitId is required');

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  // 在庫を持たせない（設計書 §5）。今日の3人を毎回引き直して照合するだけなので、
  // 同じ人物を複数のプレイヤーが雇える。
  const recruit = todaysRecruits(world.id, world.currentDay).find((candidate) => candidate.id === recruitId);
  if (recruit === undefined) return fail('unknown recruit');

  // 安い早期リターン。本当の可否は hireRecruit 内のSQLがトランザクション内で見る。
  const gold = await getPlayerGold(env.DB, player.id);
  if (gold === null) return fail('player not found', 404);
  if (gold < recruit.cost) return fail('insufficient gold');

  const partySize = await getPartySize(env.DB, player.id);
  if (partySize >= MAX_PARTY_SIZE) return fail('party is full');

  const character = buildRecruitCharacter(randomToken(), recruit);
  const hired = await hireRecruit(env.DB, { playerId: player.id, cost: recruit.cost, character });
  if (!hired) {
    // 事前チェックと書き込みの間に競合していた場合（TOCTOU）。理由を絞り込んで返す。
    const freshGold = await getPlayerGold(env.DB, player.id);
    if (freshGold !== null && freshGold < recruit.cost) return fail('insufficient gold');
    return fail('party is full');
  }

  return ok({ characterId: character.id, name: character.name, jobId: character.currentJob, cost: recruit.cost });
}
