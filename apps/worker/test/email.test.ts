import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN_A = 'email-token-a-aaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'email-token-b-bbbbbbbbbbbbbbbbbbbb';
const PLAYER_A = 'pa';
const PLAYER_B = 'pb';

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
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(PLAYER_A, WORLD, 'あきら', await sha256Hex(TOKEN_A), '2026-09-04T00:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(PLAYER_B, WORLD, 'べにこ', await sha256Hex(TOKEN_B), '2026-09-04T00:00:00.000Z').run();
}

function registerEmail(token: string, email: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/email', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

async function playerRow(id: string): Promise<{ email: string | null; token_hash: string }> {
  const row = await env.DB.prepare('SELECT email, token_hash FROM players WHERE id = ?')
    .bind(id)
    .first<{ email: string | null; token_hash: string }>();
  if (row === null) throw new Error('player not found');
  return row;
}

beforeEach(() => setup());

describe('POST /api/email（設計書 §4・§8 テスト1・2）', () => {
  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com' }),
    });
    expect(response.status).toBe(401);
  });

  it('登録できる', async () => {
    const response = await registerEmail(TOKEN_A, 'akira@example.com');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { registered: true } });

    const row = await playerRow(PLAYER_A);
    expect(row.email).toBe('akira@example.com');
  });

  it('変更できる（上書き）', async () => {
    await registerEmail(TOKEN_A, 'old@example.com');
    const response = await registerEmail(TOKEN_A, 'new@example.com');
    expect(response.status).toBe(200);

    const row = await playerRow(PLAYER_A);
    expect(row.email).toBe('new@example.com');
  });

  it('空文字で削除できる。合言葉（token_hash）は変わらない', async () => {
    await registerEmail(TOKEN_A, 'akira@example.com');
    const before = await playerRow(PLAYER_A);

    const response = await registerEmail(TOKEN_A, '');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { registered: false } });

    const row = await playerRow(PLAYER_A);
    expect(row.email).toBeNull();
    // メール登録の削除は合言葉の状態に一切触れない（設計書 §2.1、0009で撤回した
    // 「メール登録に紐づけて合言葉の控えを持つ」設計とは無関係になった）。
    expect(row.token_hash).toBe(before.token_hash);
  });

  it('形式が最低限でも通る（@を含み空白が無ければ足りる。設計書 §4）', async () => {
    const response = await registerEmail(TOKEN_A, 'a@b');
    expect(response.status).toBe(200);
  });

  it('@が無い・空白を含む場合は断る', async () => {
    const noAt = await registerEmail(TOKEN_A, 'not-an-email');
    expect(noAt.status).toBe(400);

    const withSpace = await registerEmail(TOKEN_A, 'a @example.com');
    expect(withSpace.status).toBe(400);
  });

  it('他人のアドレスを変えられない（認可。設計書 §8 テスト2）', async () => {
    await registerEmail(TOKEN_A, 'akira@example.com');

    // Bは自分のトークンでしか自分のメールを操作できない。Aのメールに影響しない。
    const response = await registerEmail(TOKEN_B, 'beniko@example.com');
    expect(response.status).toBe(200);

    const rowA = await playerRow(PLAYER_A);
    const rowB = await playerRow(PLAYER_B);
    expect(rowA.email).toBe('akira@example.com');
    expect(rowB.email).toBe('beniko@example.com');
  });
});
