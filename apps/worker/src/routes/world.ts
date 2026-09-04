import { requirePlayer } from '../auth.js';
import { getWorld, listClosedDays } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

export async function handleWorld(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  const world = await getWorld(env.DB, player.worldId);
  if (world === null) return fail('world not found', 404);

  const closed = await listClosedDays(env.DB, world.id);

  return ok({
    id: world.id,
    name: world.name,
    currentDay: world.currentDay,
    chapter: world.chapter,
    tags: world.tags,
    history: closed.map((day) => ({
      dayNo: day.dayNo,
      optionIds: day.optionIds,
      chosenId: day.chosenId,
      counts: day.counts,
      tiebroken: day.tiebroken,
    })),
  });
}
