import { requirePlayer } from '../auth.js';
import { dismissFromParty, getCharacterForPlayer } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type DismissBody = { characterId?: unknown };

/**
 * 雇用メンバーを解雇する（設計書 §5）。金は戻らない・主人公は解雇できない・
 * characters行そのものは消さない（過去の戦闘記録から参照できるように残す）。
 *
 * `getCharacterForPlayer` で所有者チェックを済ませてから is_hero を見るので、
 * 他人のIDにも主人公にも同じ経路でここで断れる。
 */
export async function handleDismiss(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: DismissBody;
  try {
    body = (await request.json()) as DismissBody;
  } catch {
    return fail('invalid JSON body');
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  if (characterId === '') return fail('characterId is required');

  const found = await getCharacterForPlayer(env.DB, player.id, characterId);
  if (found === null) return fail('character not found', 404);
  if (found.isHero) return fail('cannot dismiss hero');

  const dismissed = await dismissFromParty(env.DB, player.id, characterId);
  if (!dismissed) return fail('character is not in the party');

  return ok({ characterId });
}
