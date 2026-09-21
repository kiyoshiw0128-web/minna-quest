import { requirePlayer, sha256Hex } from '../auth.js';
import { adviseLoadout, adviseRecruit } from '../aiAdvisor.js';
import type { Env } from '../env.js';
import { fail, ok } from '../respond.js';
import { getCharacterForPlayer, getPartyCharacters, getPlayerGold, getPlayerItemIds, getWorld } from '../store.js';
import { todaysRecruits } from './tavern.js';

type Body = { kind?: unknown; characterId?: unknown };

async function cached<T>(db: D1Database, playerId: string, kind: string, fingerprint: string): Promise<T | null> {
  const row = await db.prepare(
    'SELECT payload FROM ai_advice_cache WHERE player_id = ? AND kind = ? AND fingerprint = ?',
  ).bind(playerId, kind, fingerprint).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as T : null;
}

async function saveCache(
  db: D1Database, playerId: string, kind: string, fingerprint: string, payload: unknown,
): Promise<void> {
  await db.prepare(
    `INSERT OR REPLACE INTO ai_advice_cache (player_id, kind, fingerprint, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(playerId, kind, fingerprint, JSON.stringify(payload), new Date().toISOString()).run();
}

export async function handleAiAdvice(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);
  let body: Body;
  try { body = await request.json() as Body; } catch { return fail('invalid JSON body'); }

  if (body.kind === 'recruit') {
    const world = await getWorld(env.DB, player.worldId);
    if (!world) return fail('world not found', 404);
    const [party, gold, recruits] = await Promise.all([
      getPartyCharacters(env.DB, player.id),
      getPlayerGold(env.DB, player.id),
      Promise.resolve(todaysRecruits(world.id, world.currentDay)),
    ]);
    if (gold === null) return fail('player not found', 404);
    const fingerprint = await sha256Hex(JSON.stringify({ party, gold, recruits }));
    const hit = await cached(env.DB, player.id, 'recruit', fingerprint);
    if (hit) return ok({ ...hit as object, cached: true });
    const advice = await adviseRecruit(party, recruits, gold, env.TYPESAFE_API_KEY);
    if (advice.source === 'jev') await saveCache(env.DB, player.id, 'recruit', fingerprint, advice);
    return ok({ ...advice, cached: false });
  }

  if (body.kind === 'loadout') {
    const characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (!characterId) return fail('characterId is required');
    const [found, party, items] = await Promise.all([
      getCharacterForPlayer(env.DB, player.id, characterId),
      getPartyCharacters(env.DB, player.id),
      getPlayerItemIds(env.DB, player.id),
    ]);
    if (!found) return fail('character not found', 404);

    const reserved = new Map<string, number>();
    for (const member of party) {
      if (member.id === characterId) continue;
      for (const id of [member.equippedWeapon, member.equippedArmor]) {
        if (id) reserved.set(id, (reserved.get(id) ?? 0) + 1);
      }
    }
    const available = [...items];
    for (const [id, count] of reserved) {
      for (let removed = 0; removed < count; removed += 1) {
        const index = available.indexOf(id);
        if (index >= 0) available.splice(index, 1);
      }
    }
    const fingerprint = await sha256Hex(JSON.stringify({ character: found.character, available }));
    const cacheKind = `loadout:${characterId}`;
    const hit = await cached(env.DB, player.id, cacheKind, fingerprint);
    if (hit) return ok({ ...hit as object, cached: true });
    const advice = await adviseLoadout(found.character, available, env.TYPESAFE_API_KEY);
    if (advice.source === 'jev') await saveCache(env.DB, player.id, cacheKind, fingerprint, advice);
    return ok({ ...advice, cached: false });
  }

  return fail('kind must be recruit or loadout');
}
