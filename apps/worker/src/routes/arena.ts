import {
  ARENA_FINAL_FLOOR, JOBS, PASSIVES, SKILLS, arenaFloor, gainExp, simulate, toPartyMember,
} from '@mq/core';
import type { BattlePlan, Character, Job } from '@mq/core';
import { requirePlayer } from '../auth.js';
import {
  getArenaClearedAt, getArenaFirstClears, getArenaRanking, getArenaReachedFloor, getPartyCharacters,
  getWorld, recordArenaWin,
} from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

/**
 * currentJob に対応する Job を引く。battle.ts / me.ts の jobOf と同じ理由・
 * 同じ挙動（見つからないのはマスタとDBがずれた異常事態なので投げる）。
 * 3箇所目の複製だが、共有ヘルパーを増やすほどの重複ではない
 * （me.ts のコメントがすでにこの判断を示している）。
 */
function jobOf(character: Character): Job {
  const job = JOBS[character.currentJob as keyof typeof JOBS] as Job | undefined;
  if (job === undefined) throw new Error(`unknown job: ${character.currentJob}`);
  return job;
}

/** クエリの `floor` を読む。数値でなければ「指定なし」として扱う。 */
function requestedFloorNo(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * リクエストの plan を BattlePlan の形に整える。battle.ts の sanitizePlan と
 * 同じ理由・同じ挙動（技IDの妥当性はここで見ない。core の simulate が
 * unknownSkill として記録する）。
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

/**
 * 指定された階が「今開いている」か。到達階+1（次に挑める階）までで、
 * かつ塔の範囲（1〜20）に収まっていること（設計書 §3「飛ばせない」）。
 * 開いていない階は GET でも POST でも一切の情報を返さない・受け付けない
 * （設計書 §8 テスト5：20階は敵の情報はおろか名前も出さない）。
 */
function isOpen(floor: number, reachedFloor: number): boolean {
  return Number.isInteger(floor) && floor >= 1 && floor <= ARENA_FINAL_FLOOR && floor <= reachedFloor + 1;
}

/**
 * いま挑める階・到達階・各階の記録・パーティを返す（設計書 §5）。
 *
 * `floor` クエリで、すでに開いている階（クリア済みも含む）の敵を個別に見られる。
 * 「開いた階にはいつでも戻れる。並びの練習になる」（設計書 §3）ためには、
 * 直近の挑戦対象だけでなく過去に開いた階の行動表も見えないと練習にならない。
 * 指定が無ければ既定で「次に挑む階」を返す。
 *
 * 開いていない階（未到達、または20階を19階クリア前に指定した場合）は
 * `enemy` を含めない。行動表はおろか、階の定義（`arenaFloor`）自体を
 * 一切参照しないので、名前も漏れない。
 */
export async function handleGetArena(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const reachedFloor = await getArenaReachedFloor(env.DB, player.id);
  const challengeFloor = reachedFloor >= ARENA_FINAL_FLOOR ? null : reachedFloor + 1;

  const requested = requestedFloorNo(new URL(request.url).searchParams.get('floor'));
  const targetFloor = requested ?? challengeFloor;

  const [clearedAtByFloor, firstClears, characters] = await Promise.all([
    getArenaClearedAt(env.DB, player.id),
    getArenaFirstClears(env.DB),
    getPartyCharacters(env.DB, player.id),
  ]);

  const floors = Array.from({ length: ARENA_FINAL_FLOOR }, (_, index) => {
    const floor = index + 1;
    const open = isOpen(floor, reachedFloor);
    return {
      floor,
      opened: open,
      clearedAt: clearedAtByFloor.get(floor) ?? null,
      // 誰が最初に倒したかも、その階が自分にとって開いていなければ見せない
      // （階の存在そのものは隠せないが、20階の「誰が初撃破か」まで先に
      // 見えてしまうと、19階クリア前から裏ボスの手応えを類推できてしまう）。
      firstClearedBy: open ? (firstClears.get(floor)?.playerId ?? null) : null,
    };
  });

  const party = characters.map((character) => toPartyMember(character, jobOf(character), SKILLS, PASSIVES));

  if (targetFloor === null || !isOpen(targetFloor, reachedFloor)) {
    return ok({ reachedFloor, challengeFloor, floors, targetFloor: null, enemy: null, party });
  }

  const floorDef = arenaFloor(targetFloor);
  // ARENA_FLOORS は1〜20を必ず網羅しているので理論上は起こらないが、
  // isOpen の範囲チェックとは独立に、存在しない階の定義を握りつぶさず
  // 「情報なし」として返す（境界を二重に守る）。
  if (floorDef === null) {
    return ok({ reachedFloor, challengeFloor, floors, targetFloor: null, enemy: null, party });
  }

  return ok({
    reachedFloor,
    challengeFloor,
    floors,
    targetFloor,
    // 行動表をそのまま返す。本編の戦闘（GET /api/battle）と同じく、
    // 事前セット式のパズルとして成立させる前提なので隠さない（設計書 §5）。
    enemy: floorDef.enemy,
    party,
  });
}

type ArenaBody = { floor?: unknown; plan?: unknown };

/**
 * 闘技場の1階に挑む（設計書 §5）。
 *
 * 開いていない階（到達階+1より先）は断る。core の決定論的な simulate に
 * そのまま任せ、勝敗の計算はクライアントにさせない（GET /api/battle と同じ方針）。
 * 負けても罰は無く、DBには何も残さない（設計書 §2「勝てるまで並びを組み替える」）。
 * 勝った場合の報酬付与・進捗記録・最初の1人の記録は `recordArenaWin` が
 * 1バッチで行う（設計書 §5「同じバッチ」）。
 *
 * playerId は常に `requirePlayer` が返す認証済みの本人であり、リクエスト側が
 * 別人のIDを指定する余地がそもそも無い。他人の進捗を書き換える経路は
 * 存在しない（設計書 §8 テスト9）。
 */
export async function handlePostArena(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: ArenaBody;
  try {
    body = (await request.json()) as ArenaBody;
  } catch {
    return fail('invalid JSON body');
  }

  const floor = typeof body.floor === 'number' && Number.isInteger(body.floor) ? body.floor : null;
  if (floor === null) return fail('floor must be an integer');

  const plan = sanitizePlan(body.plan);
  if (plan === null) return fail('plan must map characterId to a list of skillId|null');

  const reachedFloor = await getArenaReachedFloor(env.DB, player.id);
  if (!isOpen(floor, reachedFloor)) return fail('floor not open');

  const floorDef = arenaFloor(floor);
  if (floorDef === null) return fail('floor not open');

  const characters = await getPartyCharacters(env.DB, player.id);
  const partyMembers = characters.map((character) => toPartyMember(character, jobOf(character), SKILLS, PASSIVES));

  const log = simulate(partyMembers, floorDef.enemy, plan);

  if (log.result !== 'win') {
    return ok({ log, rewarded: false, firstClear: false });
  }

  const clearedAt = new Date().toISOString();

  // 呼び出し時点のキャラの状態にそのまま経験値を乗せて、書き込む候補値を作る。
  // 実際に書き込むかは recordArenaWin 内のSQLガードが決める。すでにこの階を
  // クリア済みなら、ここで計算した値は捨てられてDBは一切変わらない
  // （battle.ts の handlePostBattle と同じ考え方）。
  const partyRewards = characters.map((character) => {
    const gained = gainExp(character, { adventure: floorDef.reward.exp, job: floorDef.reward.exp }, JOBS);
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

  const { rewarded, firstClear } = await recordArenaWin(env.DB, {
    playerId: player.id,
    floor,
    clearedAt,
    goldAward: floorDef.reward.gold,
    party: partyRewards,
  });

  return ok({ log, rewarded, firstClear });
}

/**
 * 同じ世界の全員の到達階（設計書 §5・§6「個人戦でも他人がどこまで登ったかは
 * 見える」）。書き込みは一切無いので、他人の進捗を書き換える経路にはならない。
 */
export async function handleArenaRanking(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const ranking = await getArenaRanking(env.DB, world.id);
  return ok({ ranking });
}
