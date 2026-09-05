import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'job-token-aaaaaaaaaaaaaaaaaaaaa';
const PLAYER = 'p1';
const HERO = 'hero1';

const OTHER_TOKEN = 'other-token-aaaaaaaaaaaaaaaaaa';
const OTHER_PLAYER = 'p2';
const OTHER_HERO = 'hero2';

const APTITUDE = JSON.stringify({ maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' });

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
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(PLAYER, WORLD, 'きよし', await sha256Hex(TOKEN), '2026-09-04T00:00:00.000Z', 0).run();
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(OTHER_PLAYER, WORLD, 'じろう', await sha256Hex(OTHER_TOKEN), '2026-09-04T00:00:00.000Z', 0).run();
}

/** 主人公を1体作り、パーティ枠0に入れる。 */
async function seedHero(
  playerId: string, heroId: string, options: { jobId?: string; jobLevel?: number; slot?: number } = {},
): Promise<void> {
  const jobId = options.jobId ?? 'warrior';
  const jobLevel = options.jobLevel ?? 1;
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive, is_hero)
     VALUES (?, ?, ?, 5, 0, ?, ?, '[]', '[]', 1)`,
  ).bind(heroId, playerId, 'ゆうしゃ', APTITUDE, jobId).run();
  await env.DB.prepare(
    `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, ?, ?, 0)`,
  ).bind(heroId, jobId, jobLevel).run();
  await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, ?)`)
    .bind(playerId, heroId, options.slot ?? 0).run();
}

/** 雇用メンバーを1体作り、パーティ枠に入れる。 */
async function seedMember(
  playerId: string, characterId: string, slot: number, jobId = 'warrior',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive, is_hero)
     VALUES (?, ?, ?, 1, 0, ?, ?, '[]', '[]', 0)`,
  ).bind(characterId, playerId, `member${slot}`, APTITUDE, jobId).run();
  await env.DB.prepare(
    `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, ?, 1, 0)`,
  ).bind(characterId, jobId).run();
  await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, ?)`)
    .bind(playerId, characterId, slot).run();
}

function post(path: string, token: string, body: unknown): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(setup);

describe('POST /api/job（設計書 §3）', () => {
  it('転職すると現在の職業が変わり、冒険レベルは下がらない', async () => {
    await seedHero(PLAYER, HERO, { jobId: 'warrior', jobLevel: 5 });

    const response = await post('/api/job', TOKEN, { characterId: HERO, jobId: 'mage' });
    expect(response.status).toBe(200);

    const row = await env.DB.prepare('SELECT current_job, adventure_level FROM characters WHERE id = ?')
      .bind(HERO).first<{ current_job: string; adventure_level: number }>();
    expect(row?.current_job).toBe('mage');
    expect(row?.adventure_level).toBe(5); // 転職前と変わらない
  });

  it('就いたことのある職業に戻ると、そのジョブレベルが保たれている', async () => {
    await seedHero(PLAYER, HERO, { jobId: 'warrior', jobLevel: 7 });
    // 一旦 mage に転職(初めて)してから、warrior に戻す。
    await post('/api/job', TOKEN, { characterId: HERO, jobId: 'mage' });
    const back = await post('/api/job', TOKEN, { characterId: HERO, jobId: 'warrior' });
    expect(back.status).toBe(200);

    const jobLevel = await env.DB.prepare(
      'SELECT level FROM job_levels WHERE character_id = ? AND job_id = ?',
    ).bind(HERO, 'warrior').first<{ level: number }>();
    expect(jobLevel?.level).toBe(7); // 転職前のレベルのまま
  });

  it('条件を満たさない上級職には転職できない', async () => {
    await seedHero(PLAYER, HERO, { jobId: 'warrior', jobLevel: 1 });

    const response = await post('/api/job', TOKEN, { characterId: HERO, jobId: 'paladin' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'job not unlocked' });
  });

  it('転職した瞬間に、その職業のその時点までの技を習得している', async () => {
    await seedHero(PLAYER, HERO, { jobId: 'warrior', jobLevel: 1 });

    const response = await post('/api/job', TOKEN, { characterId: HERO, jobId: 'mage' });
    expect(response.status).toBe(200);

    // mage のレベル1習得は iceLance（packages/core/src/data/jobs.ts）。
    const learned = await env.DB.prepare(
      `SELECT id FROM learned WHERE character_id = ? AND kind = 'skill'`,
    ).bind(HERO).all<{ id: string }>();
    expect(learned.results.map((row) => row.id)).toContain('iceLance');
  });

  it('雇用メンバーも転職できる', async () => {
    await seedHero(PLAYER, HERO);
    await seedMember(PLAYER, 'member1', 1, 'warrior');

    const response = await post('/api/job', TOKEN, { characterId: 'member1', jobId: 'mage' });
    expect(response.status).toBe(200);

    const row = await env.DB.prepare('SELECT current_job FROM characters WHERE id = ?')
      .bind('member1').first<{ current_job: string }>();
    expect(row?.current_job).toBe('mage');
  });

  it('他人のキャラの職業は変えられない（認可）', async () => {
    await seedHero(PLAYER, HERO);
    await seedHero(OTHER_PLAYER, OTHER_HERO);

    const response = await post('/api/job', TOKEN, { characterId: OTHER_HERO, jobId: 'mage' });
    expect(response.status).toBe(404);

    const row = await env.DB.prepare('SELECT current_job FROM characters WHERE id = ?')
      .bind(OTHER_HERO).first<{ current_job: string }>();
    expect(row?.current_job).toBe('warrior'); // 変わっていない
  });

  it('認証が無ければ401', async () => {
    await seedHero(PLAYER, HERO);
    const response = await SELF.fetch('https://example.com/api/job', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ characterId: HERO, jobId: 'mage' }),
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/equip（設計書 §4）', () => {
  async function seedHeroWithSkills(): Promise<void> {
    await seedHero(PLAYER, HERO, { jobId: 'warrior', jobLevel: 1 });
    await env.DB.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', 'slash')`).bind(HERO).run();
    await env.DB.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'passive', 'ironSkin')`).bind(HERO).run();
  }

  it('習得していない技は装備できない', async () => {
    await seedHeroWithSkills();
    const response = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['provoke'], passiveIds: [],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'notLearned' });
  });

  it('枠数を超えて装備できない', async () => {
    await seedHeroWithSkills();
    const response = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash'], passiveIds: [],
    });
    expect(response.status).toBe(400);
  });

  it('装備の更新は片方だけ通らない（アクティブが不正ならパッシブも変わらない）', async () => {
    await seedHeroWithSkills();
    const before = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['slash'], passiveIds: ['ironSkin'],
    });
    expect(before.status).toBe(200);

    const invalid = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['notLearnedSkill'], passiveIds: [],
    });
    expect(invalid.status).toBe(400);

    const row = await env.DB.prepare('SELECT equipped_active, equipped_passive FROM characters WHERE id = ?')
      .bind(HERO).first<{ equipped_active: string; equipped_passive: string }>();
    expect(JSON.parse(row?.equipped_active ?? '[]')).toEqual(['slash']);
    expect(JSON.parse(row?.equipped_passive ?? '[]')).toEqual(['ironSkin']); // パッシブも変わっていない
  });

  it('装備の更新は片方だけ通らない（パッシブが不正ならアクティブも変わらない）', async () => {
    // 実装がアクティブを先に検証・先に書き込んでしまう順序バグを持つと、
    // 後続のパッシブ検証だけが落ちてもアクティブは既に書き終えている、
    // という半端な状態が起こりうる。これを検出するには、アクティブ側は
    // 妥当だがパッシブ側だけが不正なリクエストを送る必要がある
    // （アクティブが先に弾かれるケースだと、この順序バグを検出できない）。
    await seedHeroWithSkills();
    const before = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['slash'], passiveIds: ['ironSkin'],
    });
    expect(before.status).toBe(200);

    const invalid = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: [], passiveIds: ['notLearnedPassive'],
    });
    expect(invalid.status).toBe(400);

    const row = await env.DB.prepare('SELECT equipped_active, equipped_passive FROM characters WHERE id = ?')
      .bind(HERO).first<{ equipped_active: string; equipped_passive: string }>();
    expect(JSON.parse(row?.equipped_active ?? '[]')).toEqual(['slash']); // アクティブも変わっていない
    expect(JSON.parse(row?.equipped_passive ?? '[]')).toEqual(['ironSkin']);
  });

  it('正しい装備は両方まとめて反映される', async () => {
    await seedHeroWithSkills();
    const response = await post('/api/equip', TOKEN, {
      characterId: HERO, activeIds: ['slash'], passiveIds: ['ironSkin'],
    });
    expect(response.status).toBe(200);

    const row = await env.DB.prepare('SELECT equipped_active, equipped_passive FROM characters WHERE id = ?')
      .bind(HERO).first<{ equipped_active: string; equipped_passive: string }>();
    expect(JSON.parse(row?.equipped_active ?? '[]')).toEqual(['slash']);
    expect(JSON.parse(row?.equipped_passive ?? '[]')).toEqual(['ironSkin']);
  });

  it('他人のキャラの装備は変えられない（認可）', async () => {
    await seedHero(OTHER_PLAYER, OTHER_HERO);
    const response = await post('/api/equip', TOKEN, {
      characterId: OTHER_HERO, activeIds: [], passiveIds: [],
    });
    expect(response.status).toBe(404);
  });

  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/equip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ characterId: HERO, activeIds: [], passiveIds: [] }),
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/party（設計書 §5）', () => {
  it('主人公をパーティから外せない', async () => {
    await seedHero(PLAYER, HERO);
    await seedMember(PLAYER, 'member1', 1);

    const response = await post('/api/party', TOKEN, { order: ['member1'] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'cannot remove hero from party' });
  });

  it('並べ替えができる', async () => {
    await seedHero(PLAYER, HERO);
    await seedMember(PLAYER, 'member1', 1);

    const response = await post('/api/party', TOKEN, { order: ['member1', HERO] });
    expect(response.status).toBe(200);

    const rows = await env.DB.prepare('SELECT character_id, slot FROM party WHERE player_id = ? ORDER BY slot')
      .bind(PLAYER).all<{ character_id: string; slot: number }>();
    expect(rows.results.map((r) => r.character_id)).toEqual(['member1', HERO]);
  });

  it('4人を超えられない', async () => {
    await seedHero(PLAYER, HERO);
    for (let i = 1; i <= 4; i++) await seedMember(PLAYER, `member${i}`, i);

    const response = await post('/api/party', TOKEN, {
      order: [HERO, 'member1', 'member2', 'member3', 'member4'],
    });
    expect(response.status).toBe(400);
  });

  it('他人のキャラを混ぜたら断る（認可）', async () => {
    await seedHero(PLAYER, HERO);
    await seedHero(OTHER_PLAYER, OTHER_HERO);

    const response = await post('/api/party', TOKEN, { order: [HERO, OTHER_HERO] });
    expect(response.status).toBe(404);

    // 変わっていないことも確認する。
    const rows = await env.DB.prepare('SELECT character_id FROM party WHERE player_id = ?')
      .bind(PLAYER).all<{ character_id: string }>();
    expect(rows.results.map((r) => r.character_id)).toEqual([HERO]);
  });

  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/party', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: [HERO] }),
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/dismiss（設計書 §5）', () => {
  it('主人公は解雇できない', async () => {
    await seedHero(PLAYER, HERO);
    const response = await post('/api/dismiss', TOKEN, { characterId: HERO });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'cannot dismiss hero' });
  });

  it('雇用メンバーを解雇でき、金は戻らない', async () => {
    await seedHero(PLAYER, HERO);
    await seedMember(PLAYER, 'member1', 1);
    await env.DB.prepare('UPDATE players SET gold = ? WHERE id = ?').bind(50, PLAYER).run();

    const response = await post('/api/dismiss', TOKEN, { characterId: 'member1' });
    expect(response.status).toBe(200);

    const party = await env.DB.prepare('SELECT character_id FROM party WHERE player_id = ?')
      .bind(PLAYER).all<{ character_id: string }>();
    expect(party.results.map((r) => r.character_id)).toEqual([HERO]);

    const gold = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER).first<{ gold: number }>();
    expect(gold?.gold).toBe(50); // 戻らない
  });

  it('解雇してもそのキャラの記録は残る', async () => {
    await seedHero(PLAYER, HERO);
    await seedMember(PLAYER, 'member1', 1);

    await post('/api/dismiss', TOKEN, { characterId: 'member1' });

    const character = await env.DB.prepare('SELECT id FROM characters WHERE id = ?').bind('member1').first();
    expect(character).not.toBeNull();
  });

  it('他人のキャラは解雇できない（認可）', async () => {
    await seedHero(OTHER_PLAYER, OTHER_HERO);
    await seedMember(OTHER_PLAYER, 'other-member1', 1);

    const response = await post('/api/dismiss', TOKEN, { characterId: 'other-member1' });
    expect(response.status).toBe(404);

    const party = await env.DB.prepare('SELECT character_id FROM party WHERE player_id = ?')
      .bind(OTHER_PLAYER).all<{ character_id: string }>();
    expect(party.results.map((r) => r.character_id)).toEqual(expect.arrayContaining(['other-member1'])); // 変わっていない

    const stillOther = party.results.find((r) => r.character_id === 'other-member1');
    expect(stillOther).toBeDefined();
  });

  it('認証が無ければ401', async () => {
    const response = await SELF.fetch('https://example.com/api/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ characterId: HERO }),
    });
    expect(response.status).toBe(401);
  });
});
