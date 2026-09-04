import { requirePlayer } from '../auth.js';
import { getDay, getWorld, listVotes } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

export async function handleToday(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const day = await getDay(env.DB, world.id, world.currentDay);
  if (day === null) return fail('day not found', 404);

  const votes = await listVotes(env.DB, world.id, day.dayNo);
  const mine = votes.find((vote) => vote.playerId === player.id);

  // 票数は締めるまで返さない。先に見えると後から投票する人が流されるため。
  const closed = day.chosenId !== null;

  return ok({
    dayNo: day.dayNo,
    chapter: world.chapter,
    optionIds: day.optionIds,
    myVote: mine?.optionId ?? null,
    chosenId: day.chosenId,
    counts: closed ? day.counts : null,
    tiebroken: closed ? day.tiebroken : null,
  });
}
