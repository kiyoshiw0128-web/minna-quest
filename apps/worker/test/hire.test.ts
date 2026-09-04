import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';
import { todaysRecruits } from '../src/routes/tavern.js';

const WORLD = 'w1';
const TOKEN = 'token-hire-aaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';

async function setup(gold: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'きよし', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z', gold).run();
}

function hire(recruitId: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/hire', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recruitId }),
  });
}

function firstRecruit(): { id: string; cost: number } {
  return todaysRecruits(WORLD, 1)[0];
}

describe('POST /api/hire（設計書 §5）', () => {
  it('金貨が足りなければ断る', async () => {
    const recruit = firstRecruit();
    await setup(recruit.cost - 1);

    const response = await hire(recruit.id);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'insufficient gold' });

    const party = await env.DB.prepare('SELECT COUNT(*) AS n FROM party WHERE player_id = ?').bind(PLAYER).first<{ n: number }>();
    expect(party?.n).toBe(0);
  });

  it('金貨が足りれば雇えて、金貨が引かれてパーティに入る', async () => {
    const recruit = firstRecruit();
    await setup(recruit.cost);

    const response = await hire(recruit.id);
    expect(response.status).toBe(200);

    const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER).first<{ gold: number }>();
    expect(player?.gold).toBe(0);

    const party = await env.DB.prepare('SELECT character_id, slot FROM party WHERE player_id = ?').bind(PLAYER).all<{ character_id: string; slot: number }>();
    expect(party.results).toHaveLength(1);
    expect(party.results[0].slot).toBe(0);
  });

  it('パーティが埋まっていれば（4人）雇えない', async () => {
    const recruit = firstRecruit();
    await setup(recruit.cost * 10); // 金貨は十分にしておき、断られる理由がパーティ満杯だけになるようにする

    for (let slot = 0; slot < 4; slot++) {
      await env.DB.prepare('INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, ?)')
        .bind(PLAYER, `dummy-${slot}`, slot).run();
    }

    const response = await hire(recruit.id);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'party is full' });

    const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER).first<{ gold: number }>();
    expect(player?.gold).toBe(recruit.cost * 10);
  });

  it('同じ人物を複数プレイヤーが雇える（在庫を持たない）', async () => {
    const recruit = firstRecruit();
    await setup(recruit.cost);
    await env.DB.prepare(
      `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind('p2', WORLD, 'じろう', await sha256Hex('token-hire-2-aaaaaaaaaaaaaaaa'), '2026-09-04T00:00:00.000Z', recruit.cost).run();

    const first = await hire(recruit.id);
    expect(first.status).toBe(200);

    const secondResponse = await SELF.fetch('https://example.com/api/hire', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-hire-2-aaaaaaaaaaaaaaaa', 'content-type': 'application/json' },
      body: JSON.stringify({ recruitId: recruit.id }),
    });
    expect(secondResponse.status).toBe(200);
  });

  it('知らない recruitId は断る', async () => {
    await setup(9999);
    const response = await hire('not-a-recruit');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'unknown recruit' });
  });

  it('認証が無ければ401', async () => {
    await setup(0);
    const response = await SELF.fetch('https://example.com/api/hire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recruitId: 'x' }),
    });
    expect(response.status).toBe(401);
  });
});
