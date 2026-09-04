import { requirePlayer } from '../auth.js';
import { getDay, getWorld, upsertVote } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type VoteBody = { optionId?: unknown };

export async function handleVote(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: VoteBody;
  try {
    body = (await request.json()) as VoteBody;
  } catch {
    return fail('invalid JSON body');
  }

  const optionId = typeof body.optionId === 'string' ? body.optionId : '';
  if (optionId === '') return fail('optionId is required');

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const day = await getDay(env.DB, world.id, world.currentDay);
  if (day === null) return fail('day not found', 404);
  if (day.chosenId !== null) return fail('this day is already closed');
  if (!day.optionIds.includes(optionId)) return fail('option is not on the ballot');

  await upsertVote(env.DB, world.id, day.dayNo, player.id, optionId, new Date().toISOString());
  return ok({ dayNo: day.dayNo, optionId });
}
