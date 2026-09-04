import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'test-token-aaaaaaaaaaaaaaaaaaaaaa';

async function setup(currentDay: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', currentDay, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind('p1', WORLD, 'きよし', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, ?, ?)`,
  ).bind(WORLD, currentDay, JSON.stringify(['forest', 'cave', 'town'])).run();
}

function authed(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  });
}

beforeEach(() => setup(1));

describe('GET /api/today', () => {
  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/today');
    expect(response.status).toBe(401);
  });

  it('知らないトークンなら401', async () => {
    const response = await SELF.fetch('https://example.com/api/today', {
      headers: { Authorization: 'Bearer nope' },
    });
    expect(response.status).toBe(401);
  });

  it('今日の3択が返る', async () => {
    const response = await authed('/api/today');
    expect(response.status).toBe(200);
    const payload = await response.json<{ data: { dayNo: number; optionIds: string[] } }>();
    expect(payload.data.dayNo).toBe(1);
    expect(payload.data.optionIds).toEqual(['forest', 'cave', 'town']);
  });

  it('まだ投票していなければ myVote は null', async () => {
    const payload = await (await authed('/api/today')).json<{ data: { myVote: string | null } }>();
    expect(payload.data.myVote).toBeNull();
  });

  it('投票すると自分の票が見える', async () => {
    await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'cave' }) });
    const payload = await (await authed('/api/today')).json<{ data: { myVote: string | null } }>();
    expect(payload.data.myVote).toBe('cave');
  });

  it('締める前は票数を返さない', async () => {
    await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'cave' }) });
    const payload = await (await authed('/api/today')).json<{ data: { counts: unknown; chosenId: unknown } }>();
    expect(payload.data.counts).toBeNull();
    expect(payload.data.chosenId).toBeNull();
  });

  it('締めた後は票数と結果が返る', async () => {
    await env.DB.prepare(
      `UPDATE world_days SET chosen_id = ?, counts = ?, tiebroken = 0, closed_at = ?
        WHERE world_id = ? AND day_no = 1`,
    ).bind('forest', JSON.stringify({ forest: 2, cave: 1, town: 0 }), '2026-09-04T20:00:00.000Z', WORLD).run();

    const payload = await (await authed('/api/today')).json<{ data: { chosenId: string; counts: Record<string, number> } }>();
    expect(payload.data.chosenId).toBe('forest');
    expect(payload.data.counts).toEqual({ forest: 2, cave: 1, town: 0 });
  });
});

describe('POST /api/vote', () => {
  it('投票できる', async () => {
    const response = await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'forest' }) });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare('SELECT option_id FROM votes WHERE player_id = ?')
      .bind('p1').first<{ option_id: string }>();
    expect(row?.option_id).toBe('forest');
  });

  it('投票し直すと上書きになる', async () => {
    await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'forest' }) });
    await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'cave' }) });
    const all = await env.DB.prepare('SELECT option_id FROM votes WHERE player_id = ?')
      .bind('p1').all<{ option_id: string }>();
    expect(all.results).toHaveLength(1);
    expect(all.results[0].option_id).toBe('cave');
  });

  it('提示されていない選択肢は断る', async () => {
    const response = await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'moon' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'option is not on the ballot' });
  });

  it('締め済みの日には投票できない', async () => {
    await env.DB.prepare(
      `UPDATE world_days SET chosen_id = 'forest', counts = '{}', tiebroken = 0, closed_at = ?
        WHERE world_id = ? AND day_no = 1`,
    ).bind('2026-09-04T20:00:00.000Z', WORLD).run();

    const response = await authed('/api/vote', { method: 'POST', body: JSON.stringify({ optionId: 'forest' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'this day is already closed' });
  });

  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ optionId: 'forest' }),
    });
    expect(response.status).toBe(401);
  });
});
