import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { createCharacter, JOBS } from '@mq/core';
import { randomToken, sha256Hex, bearerToken } from '../src/auth.js';
import { claimInviteAndInsertPlayer, findUnusedInviteWorldId } from '../src/store.js';

const WORLD = 'w1';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
});

async function addInvite(code: string): Promise<void> {
  const hash = await sha256Hex(code);
  await env.DB.prepare(
    `INSERT INTO invites (code_hash, world_id, created_at) VALUES (?, ?, ?)`,
  ).bind(hash, WORLD, '2026-09-03T00:00:00.000Z').run();
}

describe('randomToken', () => {
  it('毎回違う値を返す', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(randomToken());
    expect(seen.size).toBe(100);
  });

  it('128ビット分の長さがある', () => {
    expect(randomToken()).toHaveLength(32);
  });
});

describe('sha256Hex', () => {
  it('同じ入力からは同じハッシュ', async () => {
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'));
  });

  it('違う入力からは違うハッシュ', async () => {
    expect(await sha256Hex('abc')).not.toBe(await sha256Hex('abd'));
  });

  it('16進64文字', async () => {
    expect(await sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('bearerToken', () => {
  it('Bearer からトークンを取り出す', () => {
    const request = new Request('https://x/', { headers: { Authorization: 'Bearer abc123' } });
    expect(bearerToken(request)).toBe('abc123');
  });

  it('ヘッダが無ければ null', () => {
    expect(bearerToken(new Request('https://x/'))).toBeNull();
  });

  it('Bearer でなければ null', () => {
    const request = new Request('https://x/', { headers: { Authorization: 'Basic abc' } });
    expect(bearerToken(request)).toBeNull();
  });
});

describe('POST /api/join', () => {
  async function join(body: unknown): Promise<Response> {
    return SELF.fetch('https://example.com/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('正しいコードで参加するとトークンとプレイヤーが返る', async () => {
    await addInvite('secret-code');
    const response = await join({ code: 'secret-code', name: 'きよし' });
    expect(response.status).toBe(200);
    const payload = await response.json<{ ok: boolean; data: { token: string; player: { name: string } } }>();
    expect(payload.ok).toBe(true);
    expect(payload.data.token).toHaveLength(32);
    expect(payload.data.player.name).toBe('きよし');
  });

  it('返ったトークンで自分を引ける', async () => {
    await addInvite('secret-code');
    const response = await join({ code: 'secret-code', name: 'きよし' });
    const payload = await response.json<{ data: { token: string } }>();

    const hash = await sha256Hex(payload.data.token);
    const row = await env.DB.prepare('SELECT name FROM players WHERE token_hash = ?')
      .bind(hash).first<{ name: string }>();
    expect(row?.name).toBe('きよし');
  });

  it('平文のコードもトークンもDBに保存されない', async () => {
    await addInvite('secret-code');
    const response = await join({ code: 'secret-code', name: 'きよし' });
    const payload = await response.json<{ data: { token: string } }>();

    const invites = await env.DB.prepare('SELECT code_hash FROM invites').all<{ code_hash: string }>();
    expect(invites.results[0].code_hash).not.toBe('secret-code');
    const players = await env.DB.prepare('SELECT token_hash FROM players').all<{ token_hash: string }>();
    expect(players.results[0].token_hash).not.toBe(payload.data.token);
  });

  it('同じコードは二度使えない', async () => {
    await addInvite('secret-code');
    await join({ code: 'secret-code', name: '一人目' });
    const second = await join({ code: 'secret-code', name: '二人目' });
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ ok: false, error: 'invalid or used invite code' });
  });

  it('知らないコードは断る', async () => {
    const response = await join({ code: 'nope', name: 'きよし' });
    expect(response.status).toBe(400);
  });

  it('名前が空なら断る', async () => {
    await addInvite('secret-code');
    const response = await join({ code: 'secret-code', name: '   ' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'name is required' });
  });

  it('壊れたJSONは500にせず400で返す', async () => {
    const response = await SELF.fetch('https://example.com/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });

  it('読み取りと書き込みの間に他人が使い切っても claimInviteAndInsertPlayer は false を返す', async () => {
    await addInvite('secret-code');
    const codeHash = await sha256Hex('secret-code');

    const worldId = await findUnusedInviteWorldId(env.DB, codeHash);
    expect(worldId).toBe(WORLD);

    // 読み取りの直後に別のリクエストが同じコードを使い切った状況を再現する。
    await env.DB.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ?')
      .bind('someone-else', '2026-09-03T00:00:00.000Z', codeHash).run();

    const hero = createCharacter({ id: 'c-race', name: 'レース', aptitude: {
      maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A',
    }, job: 'warrior' }, JOBS);

    const claimed = await claimInviteAndInsertPlayer(env.DB, {
      codeHash,
      playerId: 'p-race',
      worldId: worldId as string,
      name: 'レース',
      tokenHash: await sha256Hex('irrelevant-token'),
      usedAt: '2026-09-03T00:00:01.000Z',
      hero,
    });
    expect(claimed).toBe(false);
  });
});
