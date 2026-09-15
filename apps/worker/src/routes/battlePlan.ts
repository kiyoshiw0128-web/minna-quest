import { DEFAULT_MAX_TURNS } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { getCharacterForPlayer } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

export async function handleBattlePlan(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (!player) return fail('unauthorized', 401);
  let body: unknown;
  try { body = await request.json(); } catch { return fail('invalid JSON body'); }
  if (!body || typeof body !== 'object') return fail('characterId and turns are required');
  const { characterId, turns } = body as { characterId?: unknown; turns?: unknown };
  if (typeof characterId !== 'string' || !Array.isArray(turns) || turns.length !== DEFAULT_MAX_TURNS
      || !turns.every((id) => id === null || typeof id === 'string')) return fail('8ターン分の技を指定してください');
  const found = await getCharacterForPlayer(env.DB, player.id, characterId);
  if (!found) return fail('character not found', 404);
  if (!turns.every((id) => id === null || found.character.equippedActive.includes(id))) {
    return fail('装備中のスキルから選んでください。先にスキルを保存してください。');
  }
  await env.DB.prepare('UPDATE characters SET battle_turns = ? WHERE id = ? AND player_id = ?')
    .bind(JSON.stringify(turns), characterId, player.id).run();
  return ok({ characterId, turns });
}
