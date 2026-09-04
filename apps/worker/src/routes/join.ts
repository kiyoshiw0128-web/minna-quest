import { randomToken, sha256Hex } from '../auth.js';
import { claimInviteAndInsertPlayer, findUnusedInviteWorldId } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type JoinBody = { code?: unknown; name?: unknown };

const INVALID_INVITE = 'invalid or used invite code';

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

  const codeHash = await sha256Hex(code);
  const worldId = await findUnusedInviteWorldId(env.DB, codeHash);
  if (worldId === null) return fail(INVALID_INVITE);

  const playerId = randomToken();
  const token = randomToken();
  const now = new Date().toISOString();

  const claimed = await claimInviteAndInsertPlayer(env.DB, {
    codeHash,
    playerId,
    worldId,
    name,
    tokenHash: await sha256Hex(token),
    usedAt: now,
  });
  // 読み取りと書き込みの間に他の誰かが同じコードを使い切っていた場合、ここで0行更新になる。
  // プレイヤー行は作られてしまうが、そのトークンを誰も知らないので無害。
  if (!claimed) return fail(INVALID_INVITE);

  return ok({ token, player: { id: playerId, name, worldId } });
}
