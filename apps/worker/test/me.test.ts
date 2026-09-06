import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'me-token-aaaaaaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';
const HERO = 'hero1';

async function setup(gold: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'player_pets', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 2, 1, '[]', '2026-09-03T15:00:00.000Z').run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'いちろう', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z', gold).run();
}

/** パーティ枠0に主人公を1体作る。ジョブLvと冒険Lvをあえて違う値にして、
 * 実効ステータスがジョブLvではなく currentJob のジョブLvから計算されることを確認できるようにする。 */
async function seedHero(): Promise<void> {
  const aptitude = JSON.stringify({ maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' });
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive)
     VALUES (?, ?, ?, 5, 0, ?, 'warrior', ?, '[]')`,
  ).bind(HERO, PLAYER, 'ゆうしゃ', aptitude, JSON.stringify(['slash'])).run();
  await env.DB.prepare(
    `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, 'warrior', 3, 0)`,
  ).bind(HERO).run();
  await env.DB.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', 'slash')`).bind(HERO).run();
  await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, 0)`).bind(PLAYER, HERO).run();
}

function me(token: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => setup(120));

describe('GET /api/me（設計書 §2）', () => {
  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/me');
    expect(response.status).toBe(401);
  });

  it('名前と所持金とパーティが返る', async () => {
    await seedHero();
    const response = await me(TOKEN);
    expect(response.status).toBe(200);
    const payload = await response.json<{
      data: {
        name: string;
        gold: number;
        party: Array<{
          id: string; name: string; jobId: string; adventureLevel: number; jobLevel: number;
          stats: { maxHp: number };
          learnedSkillIds: string[]; equippedSkillIds: string[];
        }>;
      };
    }>();

    expect(payload.data.name).toBe('いちろう');
    expect(payload.data.gold).toBe(120);
    expect(payload.data.party).toHaveLength(1);

    const member = payload.data.party[0];
    expect(member.id).toBe(HERO);
    expect(member.name).toBe('ゆうしゃ');
    expect(member.jobId).toBe('warrior');
    expect(member.adventureLevel).toBe(5);
    expect(member.jobLevel).toBe(3);
    expect(member.learnedSkillIds).toEqual(['slash']);
    expect(member.equippedSkillIds).toEqual(['slash']);
    // 実効ステータスはレベル1・素質不問の基礎値より高いはず（冒険Lv5・ジョブLv3の補正が乗る）。
    expect(member.stats.maxHp).toBeGreaterThan(120);
  });

  it('パーティが空でも空配列で返る（既存プレイヤーAPIの応答は変えない）', async () => {
    const response = await me(TOKEN);
    expect(response.status).toBe(200);
    const payload = await response.json<{ data: { party: unknown[] } }>();
    expect(payload.data.party).toEqual([]);
  });

  // 段階6・設計書 §7。「仲間」画面がペット欄を出すために足したもの。
  it('ペットを持っていなければ空配列、連れているペットも null', async () => {
    const response = await me(TOKEN);
    const payload = await response.json<{ data: { pets: string[]; activePetId: string | null } }>();
    expect(payload.data.pets).toEqual([]);
    expect(payload.data.activePetId).toBeNull();
  });

  it('持っているペットのIDと、いま連れているペットが返る', async () => {
    await env.DB.prepare(
      `INSERT INTO player_pets (player_id, pet_id, obtained_at) VALUES (?, 'puppy', ?)`,
    ).bind(PLAYER, '2026-09-04T00:00:00.000Z').run();
    await env.DB.prepare('UPDATE players SET active_pet_id = ? WHERE id = ?').bind('puppy', PLAYER).run();

    const response = await me(TOKEN);
    const payload = await response.json<{ data: { pets: string[]; activePetId: string | null } }>();
    expect(payload.data.pets).toEqual(['puppy']);
    expect(payload.data.activePetId).toBe('puppy');
  });

  // 段階11・設計書 §4・§8 テスト6。
  describe('emailRegistered', () => {
    it('メール未登録ならfalse', async () => {
      const response = await me(TOKEN);
      const payload = await response.json<{ data: { emailRegistered: boolean } }>();
      expect(payload.data.emailRegistered).toBe(false);
    });

    it('メール登録済みならtrue。アドレスそのものはどのキーにも現れない', async () => {
      const address = 'himitsu@example.com';
      await env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(address, PLAYER).run();

      const response = await me(TOKEN);
      const rawText = await response.clone().text();
      const payload = await response.json<{ data: { emailRegistered: boolean } }>();

      expect(payload.data.emailRegistered).toBe(true);
      // キー名だけでなく、応答本文のどこにもアドレスの文字列が現れないことを確かめる
      // （設計書 §8 テスト6 — フィールドを削り忘れても、値そのものが漏れていれば検出できるように）。
      expect(rawText).not.toContain(address);
    });
  });
});
