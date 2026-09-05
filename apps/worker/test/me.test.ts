import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'me-token-aaaaaaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';
const HERO = 'hero1';

async function setup(gold: number): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
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
});
