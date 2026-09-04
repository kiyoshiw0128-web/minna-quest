import { randomToken, sha256Hex } from '../auth.js';
import { claimInvite, insertPlayer } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type JoinBody = { code?: unknown; name?: unknown };

export async function handleJoin(request: Request, env: Env): Promise<Response> {
  let body: JoinBody;
  try {
    body = (await request.json()) as JoinBody;
  } catch {
    return fail('invalid JSON body');
  }

  const code = typeof body.code === 'string' ? body.code : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (code === '') return fail('code is required');
  if (name === '') return fail('name is required');

  const playerId = randomToken();
  const now = new Date().toISOString();

  const worldId = await claimInvite(env.DB, await sha256Hex(code), playerId, now);
  if (worldId === null) return fail('invalid or used invite code');

  const token = randomToken();
  await insertPlayer(env.DB, {
    id: playerId,
    worldId,
    name,
    tokenHash: await sha256Hex(token),
    joinedAt: now,
  });

  return ok({ token, player: { id: playerId, name, worldId } });
}
