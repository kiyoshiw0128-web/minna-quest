import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';
import { aptitudeFromPlayerId } from '../src/aptitude.js';

const WORLD = 'w1';

async function addInvite(code: string): Promise<void> {
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(
    `INSERT INTO invites (code_hash, world_id, created_at) VALUES (?, ?, ?)`,
  ).bind(codeHash, WORLD, '2026-09-03T00:00:00.000Z').run();
}

async function join(code: string, name: string): Promise<{ id: string; name: string; worldId: string }> {
  const response = await SELF.fetch('https://example.com/api/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
  const payload = await response.json<{ ok: boolean; data: { player: { id: string; name: string; worldId: string } } }>();
  if (!payload.ok) throw new Error(`join failed: ${JSON.stringify(payload)}`);
  return payload.data.player;
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
});

describe('参加時の主人公作成（設計書 §3.1）', () => {
  it('参加すると主人公が1体でき、初期職（戦士）の技を習得している', async () => {
    await addInvite('secret-code');
    const player = await join('secret-code', 'きよし');

    const character = await env.DB
      .prepare('SELECT * FROM characters WHERE player_id = ?')
      .bind(player.id)
      .first<{
        id: string; adventure_level: number; current_job: string;
        equipped_active: string; equipped_passive: string;
      }>();
    expect(character).not.toBeNull();
    expect(character?.current_job).toBe('warrior');
    expect(character?.adventure_level).toBe(1);

    const learnedSkills = await env.DB
      .prepare(`SELECT id FROM learned WHERE character_id = ? AND kind = 'skill'`)
      .bind(character?.id)
      .all<{ id: string }>();
    // 戦士のレベル1習得は slash（packages/core/src/data/jobs.ts）。
    expect(learnedSkills.results.map((row) => row.id)).toContain('slash');

    // 装備枠にもレベル1の習得技が入っている（createCharacter の仕様）。
    expect(JSON.parse(character?.equipped_active ?? '[]')).toContain('slash');

    const jobLevel = await env.DB
      .prepare('SELECT level, exp FROM job_levels WHERE character_id = ? AND job_id = ?')
      .bind(character?.id, 'warrior')
      .first<{ level: number; exp: number }>();
    expect(jobLevel).toEqual({ level: 1, exp: 0 });

    const partySlot = await env.DB
      .prepare('SELECT character_id, slot FROM party WHERE player_id = ?')
      .bind(player.id)
      .first<{ character_id: string; slot: number }>();
    expect(partySlot).toEqual({ character_id: character?.id, slot: 0 });
  });

  it('同じ playerId からは必ず同じ素質になる（決定論）', async () => {
    // 純関数としての決定論。
    expect(aptitudeFromPlayerId('player-A')).toEqual(aptitudeFromPlayerId('player-A'));

    const first = aptitudeFromPlayerId('player-A');
    for (let i = 0; i < 5; i++) {
      expect(aptitudeFromPlayerId('player-A')).toEqual(first);
    }

    // 参加APIを通しても、保存された素質は同じ関数の計算結果と一致する
    // （後から playerId さえ分かれば誰でも検証できる、という設計の要）。
    await addInvite('det-code');
    const player = await join('det-code', 'きよし2');
    const character = await env.DB
      .prepare('SELECT aptitude FROM characters WHERE player_id = ?')
      .bind(player.id)
      .first<{ aptitude: string }>();

    expect(JSON.parse(character?.aptitude ?? '{}')).toEqual(aptitudeFromPlayerId(player.id));
  });
});
