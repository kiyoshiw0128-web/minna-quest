import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN_1 = 'token-player-1-aaaaaaaaaaaaaaaa';
const TOKEN_2 = 'token-player-2-aaaaaaaaaaaaaaaa';

async function setup(currentDay: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', currentDay, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p1', WORLD, 'いちろう', await sha256Hex(TOKEN_1), '2026-09-04T00:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p2', WORLD, 'じろう', await sha256Hex(TOKEN_2), '2026-09-04T00:00:00.000Z').run();
}

function tavern(token: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/tavern', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => setup(1));

describe('GET /api/tavern（設計書 §5）', () => {
  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/tavern');
    expect(response.status).toBe(401);
  });

  it('その日の3人が返る', async () => {
    const response = await tavern(TOKEN_1);
    expect(response.status).toBe(200);
    const payload = await response.json<{ data: { dayNo: number; recruits: unknown[] } }>();
    expect(payload.data.dayNo).toBe(1);
    expect(payload.data.recruits).toHaveLength(3);
  });

  it('全員が同じ3人を見る（決定論）', async () => {
    const a = await (await tavern(TOKEN_1)).json<{ data: { recruits: { id: string }[] } }>();
    const b = await (await tavern(TOKEN_2)).json<{ data: { recruits: { id: string }[] } }>();
    expect(a.data.recruits.map((recruit) => recruit.id)).toEqual(b.data.recruits.map((recruit) => recruit.id));
  });

  it('日が変われば顔ぶれも変わりうる', async () => {
    const day1 = await (await tavern(TOKEN_1)).json<{ data: { recruits: { id: string }[] } }>();

    await env.DB.prepare('UPDATE worlds SET current_day = 2 WHERE id = ?').bind(WORLD).run();
    const day2 = await (await tavern(TOKEN_1)).json<{ data: { recruits: { id: string }[] } }>();

    expect(day2.data.recruits.map((recruit) => recruit.id)).not.toEqual(
      day1.data.recruits.map((recruit) => recruit.id),
    );
  });
});
