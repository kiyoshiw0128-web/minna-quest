import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'test-token-bbbbbbbbbbbbbbbbbbbbbb';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 3, 1, '["met-elder"]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p1', WORLD, 'きよし', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z').run();

  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids, chosen_id, counts, tiebroken, closed_at)
     VALUES (?, 1, ?, 'crossroads', ?, 0, ?)`,
  ).bind(WORLD, JSON.stringify(['crossroads', 'restAtSpring']), JSON.stringify({ crossroads: 2, restAtSpring: 1 }), '2026-09-05T20:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, 3, ?)`,
  ).bind(WORLD, JSON.stringify(['a', 'b', 'c'])).run();
});

function authed(path: string): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
}

describe('GET /api/world', () => {
  it('認証が無ければ401', async () => {
    expect((await SELF.fetch('https://example.com/api/world')).status).toBe(401);
  });

  it('世界の進行度が返る', async () => {
    const payload = await (await authed('/api/world')).json<{
      data: { name: string; currentDay: number; chapter: number; tags: string[] };
    }>();
    expect(payload.data.name).toBe('テスト世界');
    expect(payload.data.currentDay).toBe(3);
    expect(payload.data.tags).toEqual(['met-elder']);
  });

  it('締めた日の一覧が古い順に返る', async () => {
    const payload = await (await authed('/api/world')).json<{
      data: { history: { dayNo: number; chosenId: string; counts: Record<string, number> }[] };
    }>();
    expect(payload.data.history).toHaveLength(1);
    expect(payload.data.history[0].dayNo).toBe(1);
    expect(payload.data.history[0].chosenId).toBe('crossroads');
    expect(payload.data.history[0].counts).toEqual({ crossroads: 2, restAtSpring: 1 });
  });

  it('締めていない日は履歴に出ない', async () => {
    const payload = await (await authed('/api/world')).json<{ data: { history: { dayNo: number }[] } }>();
    expect(payload.data.history.map((entry) => entry.dayNo)).not.toContain(3);
  });
});
