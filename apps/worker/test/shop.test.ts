import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN_1 = 'token-shop-1-aaaaaaaaaaaaaaaaaa';
const TOKEN_2 = 'token-shop-2-aaaaaaaaaaaaaaaaaa';

async function setup(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p1', WORLD, 'いちろう', await sha256Hex(TOKEN_1), '2026-09-04T00:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p2', WORLD, 'じろう', await sha256Hex(TOKEN_2), '2026-09-04T00:00:00.000Z').run();
}

function shop(token: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/shop', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => setup());

describe('GET /api/shop（設計書 §6）', () => {
  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/shop');
    expect(response.status).toBe(401);
  });

  it('武器・防具が20個前後返る', async () => {
    const response = await shop(TOKEN_1);
    expect(response.status).toBe(200);
    const payload = await response.json<{ data: { items: Array<{ id: string; slot: string; cost: number }> } }>();
    expect(payload.data.items.length).toBeGreaterThanOrEqual(16);
    expect(payload.data.items.some((item) => item.slot === 'weapon')).toBe(true);
    expect(payload.data.items.some((item) => item.slot === 'armor')).toBe(true);
  });

  it('全員に同じ品揃えを見せる（日替わりにしない。設計書 §6）', async () => {
    const a = await (await shop(TOKEN_1)).json<{ data: { items: { id: string }[] } }>();
    const b = await (await shop(TOKEN_2)).json<{ data: { items: { id: string }[] } }>();
    expect(a.data.items.map((item) => item.id)).toEqual(b.data.items.map((item) => item.id));
  });
});
