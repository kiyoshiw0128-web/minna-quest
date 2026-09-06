import { describe, it, expect } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'token-buy-1-aaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';

const ITEM_ID = 'rustedSword';
const ITEM_COST = 100;

async function setup(gold: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['player_items', 'players', 'invites', 'worlds']) {
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

function buy(itemId: unknown, token = TOKEN): Promise<Response> {
  return SELF.fetch('https://example.com/api/buy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });
}

async function playerGold(): Promise<number | null> {
  const row = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER).first<{ gold: number }>();
  return row?.gold ?? null;
}

async function ownedItemCount(itemId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM player_items WHERE player_id = ? AND item_id = ?')
    .bind(PLAYER, itemId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('POST /api/buy（設計書 §6・§8 テスト3）', () => {
  it('認証が無ければ401', async () => {
    await setup(9999);
    const response = await buy(ITEM_ID, 'wrong-token');
    expect(response.status).toBe(401);
  });

  it('金貨が足りなければ断る。所持品も金貨も変わらない（設計書 §8 テスト3）', async () => {
    await setup(ITEM_COST - 1);

    const response = await buy(ITEM_ID);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'insufficient gold' });

    expect(await playerGold()).toBe(ITEM_COST - 1);
    expect(await ownedItemCount(ITEM_ID)).toBe(0);
  });

  it('金貨が足りれば買えて、金貨が引かれ所持品に加わる（買うことと払うことが同時に起きる。設計書 §2）', async () => {
    await setup(ITEM_COST);

    const response = await buy(ITEM_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { itemId: ITEM_ID, cost: ITEM_COST } });

    expect(await playerGold()).toBe(0);
    expect(await ownedItemCount(ITEM_ID)).toBe(1);
  });

  it('同じ装備を2つ買える（player_itemsは複数行持てる。設計書 §6）', async () => {
    await setup(ITEM_COST * 2);

    const first = await buy(ITEM_ID);
    expect(first.status).toBe(200);
    const second = await buy(ITEM_ID);
    expect(second.status).toBe(200);

    expect(await ownedItemCount(ITEM_ID)).toBe(2);
    expect(await playerGold()).toBe(0);
  });

  it('知らないitemIdは断る', async () => {
    await setup(9999);
    const response = await buy('no-such-item');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'unknown itemId' });
  });

  it('itemIdが文字列でなければ断る', async () => {
    await setup(9999);
    const response = await buy(123);
    expect(response.status).toBe(400);
  });
});
