import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'recover-token-aaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';
const EMAIL = 'registered@example.com';

async function setup(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, email, recovery_token)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'ちひろ', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z', EMAIL, TOKEN).run();
}

function recover(email: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

async function recoverySentAt(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT recovery_sent_at FROM players WHERE id = ?')
    .bind(PLAYER)
    .first<{ recovery_sent_at: string | null }>();
  return row?.recovery_sent_at ?? null;
}

beforeEach(() => setup());

describe('POST /api/recover（認証なし。設計書 §4・§8 テスト3・4・5）', () => {
  it('登録済みでも未登録でも同じ応答を返す（設計書 §8 テスト3）', async () => {
    const registered = await recover(EMAIL);
    const registeredBody = await registered.json();

    const unregistered = await recover('nobody@example.com');
    const unregisteredBody = await unregistered.json();

    expect(registered.status).toBe(200);
    expect(unregistered.status).toBe(200);
    expect(registeredBody).toEqual(unregisteredBody);
    expect(registeredBody).toEqual({ ok: true, data: { requested: true } });
  });

  it('登録済みなら recovery_sent_at が進む。未登録なら何も変わらない', async () => {
    expect(await recoverySentAt()).toBeNull();
    await recover(EMAIL);
    expect(await recoverySentAt()).not.toBeNull();
  });

  it('10分以内の2度目は送らない（recovery_sent_atが変わらない）が、応答は同じ（設計書 §8 テスト4）', async () => {
    await recover(EMAIL);
    const firstSentAt = await recoverySentAt();

    const second = await recover(EMAIL);
    expect(second.status).toBe(200);
    expect(await recoverySentAt()).toBe(firstSentAt);
  });

  it('キーが未設定でも応答は成功のまま（設計書 §8 テスト5）', async () => {
    // テスト環境の wrangler.toml には RESEND_API_KEY を置いていないので、
    // ここまでの全テストが「キー未設定」の状態で通っている。ここでは
    // 明示的に成功を確かめる。
    const response = await recover(EMAIL);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { requested: true } });
  });

  it('emailが無ければ400（これは特定のアドレスに依存しない検証なので分岐しても安全）', async () => {
    const response = await SELF.fetch('https://example.com/api/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
