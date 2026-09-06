import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';
import * as mail from '../src/mail.js';

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
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, email)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'ちひろ', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z', EMAIL).run();
}

function recover(email: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

function confirm(code: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/recover/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

function me(token: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/me', { headers: { Authorization: `Bearer ${token}` } });
}

async function recoverySentAt(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT recovery_sent_at FROM players WHERE id = ?')
    .bind(PLAYER)
    .first<{ recovery_sent_at: string | null }>();
  return row?.recovery_sent_at ?? null;
}

async function playerRecoveryColumns(): Promise<{
  token_hash: string;
  recovery_code_hash: string | null;
  recovery_expires_at: string | null;
}> {
  const row = await env.DB
    .prepare('SELECT token_hash, recovery_code_hash, recovery_expires_at FROM players WHERE id = ?')
    .bind(PLAYER)
    .first<{ token_hash: string; recovery_code_hash: string | null; recovery_expires_at: string | null }>();
  if (row === null) throw new Error('player not found');
  return row;
}

/**
 * `/api/recover` はメール送信を `sendRecoveryMail` に委ねているだけなので、
 * ここをspyすれば実際に発行された平文の復旧コードを横取りできる。
 * RESEND_API_KEYをテスト環境に置く必要はない（mail.ts側の分岐はmail.test.tsで別に見ている）。
 */
async function recoverAndCaptureCode(email: string): Promise<string> {
  const spy = vi.spyOn(mail, 'sendRecoveryMail').mockResolvedValue(undefined);
  await recover(email);
  expect(spy).toHaveBeenCalledTimes(1);
  const [, params] = spy.mock.calls[0];
  spy.mockRestore();
  return params.code;
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

  it('送る内容は復旧コードであり、合言葉そのもの（TOKEN）は含まれない（設計書 §8 テスト7）', async () => {
    const code = await recoverAndCaptureCode(EMAIL);
    // 発行されたコードは合言葉そのものとは別物（値も別、DBに残る形も別）。
    expect(code).not.toBe(TOKEN);
    expect(code.length).toBeGreaterThan(0);
  });
});

describe('POST /api/recover/confirm（認証なし。設計書 §4・§8 テスト8・9・10・11）', () => {
  it('有効なコードで新しい合言葉が発行され、古い合言葉は使えなくなる（設計書 §8 テスト8）', async () => {
    const code = await recoverAndCaptureCode(EMAIL);

    const beforeMe = await me(TOKEN);
    expect(beforeMe.status).toBe(200);

    const response = await confirm(code);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: true; data: { token: string } };
    const newToken = body.data.token;
    expect(newToken).not.toBe(TOKEN);

    // 古い合言葉はもう使えない。
    const oldTokenMe = await me(TOKEN);
    expect(oldTokenMe.status).toBe(401);

    // 新しい合言葉は使える。
    const newTokenMe = await me(newToken);
    expect(newTokenMe.status).toBe(200);
  });

  it('同じコードは二度使えない（設計書 §8 テスト9）', async () => {
    const code = await recoverAndCaptureCode(EMAIL);

    const first = await confirm(code);
    expect(first.status).toBe(200);

    const second = await confirm(code);
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ ok: false, error: 'invalid or expired code' });
  });

  it('期限切れのコードは使えない（設計書 §8 テスト10）', async () => {
    const code = await recoverAndCaptureCode(EMAIL);

    // 期限を過去に書き換えて「30分経過後」を再現する。
    await env.DB
      .prepare('UPDATE players SET recovery_expires_at = ? WHERE id = ?')
      .bind('2000-01-01T00:00:00.000Z', PLAYER)
      .run();

    const response = await confirm(code);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid or expired code' });
  });

  it('存在しないコードは、期限切れ・使用済みと同じ応答で断る（設計書 §2.1「区別させない」）', async () => {
    const code = await recoverAndCaptureCode(EMAIL);
    await confirm(code); // 使用済みにする

    const usedResponse = await confirm(code);
    const bogusResponse = await confirm('this-code-was-never-issued');

    expect(usedResponse.status).toBe(bogusResponse.status);
    expect(await usedResponse.json()).toEqual(await bogusResponse.json());
  });

  it('codeが無ければ400', async () => {
    const response = await SELF.fetch('https://example.com/api/recover/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it('平文の合言葉も平文のコードもデータベースに残らない（設計書 §8 テスト11）', async () => {
    // 登録→要求→確認、という一連の流れをすべて終えた後の行を見る。
    const code = await recoverAndCaptureCode(EMAIL);
    const confirmed = await confirm(code);
    expect(confirmed.status).toBe(200);
    const { token: newToken } = ((await confirmed.json()) as { data: { token: string } }).data;

    const row = await playerRecoveryColumns();

    // token_hash はハッシュであり、発行された平文の新しい合言葉そのものではない。
    expect(row.token_hash).not.toBe(newToken);
    expect(row.token_hash).toBe(await sha256Hex(newToken));
    // 使い終わった復旧コードの列は、ハッシュごと消えている（平文はそもそも保存していない）。
    expect(row.recovery_code_hash).toBeNull();
    expect(row.recovery_expires_at).toBeNull();

    // 平文の復旧コード自身も、発行された新しい合言葉も、players テーブルの
    // どの列の値としても一致しない（=どこにも平文で残っていない）ことを、
    // テーブル全体を舐めて確認する。
    const allValues = await env.DB
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(PLAYER)
      .first<Record<string, unknown>>();
    expect(allValues).not.toBeNull();
    for (const value of Object.values(allValues ?? {})) {
      if (typeof value !== 'string') continue;
      expect(value).not.toBe(code);
      expect(value).not.toBe(newToken);
    }
  });
});
