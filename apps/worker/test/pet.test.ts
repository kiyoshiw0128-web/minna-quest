import { describe, it, expect } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'token-pet-aaaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';

async function setup(ownedPetIds: readonly string[] = []): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['player_pets', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'きよし', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z').run();
  for (const petId of ownedPetIds) {
    await env.DB.prepare(
      `INSERT INTO player_pets (player_id, pet_id, obtained_at) VALUES (?, ?, ?)`,
    ).bind(PLAYER, petId, '2026-09-04T00:00:00.000Z').run();
  }
}

function postPet(petId: unknown, token = TOKEN): Promise<Response> {
  return SELF.fetch('https://example.com/api/pet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ petId }),
  });
}

async function activePetId(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT active_pet_id FROM players WHERE id = ?')
    .bind(PLAYER)
    .first<{ active_pet_id: string | null }>();
  return row?.active_pet_id ?? null;
}

describe('POST /api/pet（段階6・設計書 §5・§8 テスト4）', () => {
  it('認証なしは401', async () => {
    await setup(['puppy']);
    const response = await postPet('puppy', 'wrong-token');
    expect(response.status).toBe(401);
  });

  it('持っているペットになら連れ替えられる', async () => {
    await setup(['puppy', 'kitten']);
    await env.DB.prepare('UPDATE players SET active_pet_id = ? WHERE id = ?').bind('puppy', PLAYER).run();

    const response = await postPet('kitten');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { activePetId: 'kitten' } });
    expect(await activePetId()).toBe('kitten');
  });

  it('持っていないペットには断る。DBも変わらない', async () => {
    await setup(['puppy']);
    await env.DB.prepare('UPDATE players SET active_pet_id = ? WHERE id = ?').bind('puppy', PLAYER).run();

    const response = await postPet('kitten');
    expect(response.status).toBe(403);
    expect((await response.json<{ ok: false; error: string }>()).error).toBe('pet not owned');
    // 断られた側は書き込まれず、元のまま。
    expect(await activePetId()).toBe('puppy');
  });

  it('実在しないペットIDは断る', async () => {
    await setup(['puppy']);
    const response = await postPet('no-such-pet');
    expect(response.status).toBe(400);
  });

  it('petId が文字列でなければ断る', async () => {
    await setup(['puppy']);
    const response = await postPet(123);
    expect(response.status).toBe(400);
  });
});
