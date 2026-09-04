import { describe, it, expect } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';

describe('足場', () => {
  it('マイグレーションを当てるとテーブルができる', async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = result.results.map((row) => row.name);
    for (const table of ['worlds', 'world_days', 'votes', 'players', 'invites']) {
      expect(names).toContain(table);
    }
  });

  it('Worker が起動してヘルスチェックに答える', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { status: 'ok' } });
  });

  it('知らないパスは封筒つきの404を返す', async () => {
    const response = await SELF.fetch('https://example.com/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'not found' });
  });
});
