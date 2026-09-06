import { describe, it, expect } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN = 'equip-item-token-aaaaaaaaaaaaaa';
const PLAYER = 'p1';
const HERO = 'hero1';
const SECOND = 'hero2';

const OTHER_TOKEN = 'equip-item-other-aaaaaaaaaaaaaa';
const OTHER_PLAYER = 'p2';
const OTHER_HERO = 'hero3';

const APTITUDE = JSON.stringify({ maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' });

const WEAPON = 'rustedSword';
const ARMOR = 'clothVest';

async function setup(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['player_items', 'party', 'learned', 'job_levels', 'characters', 'players', 'invites', 'worlds']) {
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

async function seedCharacter(
  playerId: string, characterId: string,
  options: { slot?: number; equippedWeapon?: string | null; equippedArmor?: string | null } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job,
        equipped_active, equipped_passive, equipped_weapon, equipped_armor, is_hero)
     VALUES (?, ?, ?, 5, 0, ?, 'warrior', '[]', '[]', ?, ?, 0)`,
  ).bind(
    characterId, playerId, characterId, APTITUDE,
    options.equippedWeapon ?? null, options.equippedArmor ?? null,
  ).run();
  await env.DB.prepare('INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, ?)')
    .bind(playerId, characterId, options.slot ?? 0).run();
}

async function giveItem(playerId: string, itemId: string): Promise<void> {
  await env.DB.prepare('INSERT INTO player_items (player_id, item_id, obtained_at) VALUES (?, ?, ?)')
    .bind(playerId, itemId, '2026-09-04T00:00:00.000Z').run();
}

function equipItem(
  characterId: string, weaponId: string | null, armorId: string | null, token = TOKEN,
): Promise<Response> {
  return SELF.fetch('https://example.com/api/equip-item', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ characterId, weaponId, armorId }),
  });
}

async function equippedOf(characterId: string): Promise<{ weapon: string | null; armor: string | null }> {
  const row = await env.DB.prepare('SELECT equipped_weapon, equipped_armor FROM characters WHERE id = ?')
    .bind(characterId)
    .first<{ equipped_weapon: string | null; equipped_armor: string | null }>();
  return { weapon: row?.equipped_weapon ?? null, armor: row?.equipped_armor ?? null };
}

describe('POST /api/equip-item（設計書 §6・§8 テスト4・テスト5・テスト6）', () => {
  it('認証が無ければ401', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);
    const response = await equipItem(HERO, null, null, 'wrong-token');
    expect(response.status).toBe(401);
  });

  it('持っている武器・防具は装備できる', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);
    await giveItem(PLAYER, WEAPON);
    await giveItem(PLAYER, ARMOR);

    const response = await equipItem(HERO, WEAPON, ARMOR);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { characterId: HERO, weaponId: WEAPON, armorId: ARMOR } });
    expect(await equippedOf(HERO)).toEqual({ weapon: WEAPON, armor: ARMOR });
  });

  it('外す（nullにする）のは所持していなくてもできる', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO, { equippedWeapon: WEAPON });
    await giveItem(PLAYER, WEAPON);

    const response = await equipItem(HERO, null, null);
    expect(response.status).toBe(200);
    expect(await equippedOf(HERO)).toEqual({ weapon: null, armor: null });
  });

  // 設計書 §8 テスト4。
  it('持っていない武器は断る。DBも変わらない', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);

    const response = await equipItem(HERO, WEAPON, null);
    expect(response.status).toBe(400);
    expect(await equippedOf(HERO)).toEqual({ weapon: null, armor: null });
  });

  it('存在しない装備IDは断る', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);

    const response = await equipItem(HERO, 'no-such-item', null);
    expect(response.status).toBe(400);
    expect((await response.json<{ error: string }>()).error).toBe('unknownItem');
  });

  it('防具を武器枠に付けようとすると断る（スロット違い）', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);
    await giveItem(PLAYER, ARMOR);

    const response = await equipItem(HERO, ARMOR, null);
    expect(response.status).toBe(400);
    expect((await response.json<{ error: string }>()).error).toBe('wrongSlot');
  });

  // 設計書 §8 テスト5（最重要の1つ）。在庫の概念が無いと、1つ買って全員に付けられてしまう。
  describe('所持数を超えて複数人には付けられない（設計書 §8 テスト5）', () => {
    it('1本しか持っていない武器を、1人目に装備できる', async () => {
      await setup();
      await seedCharacter(PLAYER, HERO);
      await seedCharacter(PLAYER, SECOND, { slot: 1 });
      await giveItem(PLAYER, WEAPON);

      const response = await equipItem(HERO, WEAPON, null);
      expect(response.status).toBe(200);
      expect(await equippedOf(HERO)).toEqual({ weapon: WEAPON, armor: null });
    });

    it('1本しか持っていない武器を、既に1人目が装備した状態で2人目には付けられない。DBも変わらない', async () => {
      await setup();
      await seedCharacter(PLAYER, HERO, { equippedWeapon: WEAPON });
      await seedCharacter(PLAYER, SECOND, { slot: 1 });
      await giveItem(PLAYER, WEAPON);

      const response = await equipItem(SECOND, WEAPON, null);
      expect(response.status).toBe(400);
      expect(await equippedOf(SECOND)).toEqual({ weapon: null, armor: null });
      // 1人目の装備も変わらず残っている。
      expect(await equippedOf(HERO)).toEqual({ weapon: WEAPON, armor: null });
    });

    it('2本持っていれば2人に装備できる', async () => {
      await setup();
      await seedCharacter(PLAYER, HERO);
      await seedCharacter(PLAYER, SECOND, { slot: 1 });
      await giveItem(PLAYER, WEAPON);
      await giveItem(PLAYER, WEAPON);

      const first = await equipItem(HERO, WEAPON, null);
      expect(first.status).toBe(200);
      const second = await equipItem(SECOND, WEAPON, null);
      expect(second.status).toBe(200);

      expect(await equippedOf(HERO)).toEqual({ weapon: WEAPON, armor: null });
      expect(await equippedOf(SECOND)).toEqual({ weapon: WEAPON, armor: null });
    });

    it('既に装備している本人が同じ装備を据え置くのは、所持数ぶんの余裕が無くても通る', async () => {
      await setup();
      await seedCharacter(PLAYER, HERO, { equippedWeapon: WEAPON, equippedArmor: null });
      await giveItem(PLAYER, WEAPON);
      await giveItem(PLAYER, ARMOR);

      // 武器は据え置き、防具だけ新しく付ける。
      const response = await equipItem(HERO, WEAPON, ARMOR);
      expect(response.status).toBe(200);
      expect(await equippedOf(HERO)).toEqual({ weapon: WEAPON, armor: ARMOR });
    });
  });

  // 設計書 §8 テスト6。
  it('他人のキャラの装備は変えられない（認可）', async () => {
    await setup();
    await seedCharacter(PLAYER, HERO);
    await seedCharacter(OTHER_PLAYER, OTHER_HERO);
    await giveItem(PLAYER, WEAPON);

    const response = await equipItem(OTHER_HERO, WEAPON, null);
    expect(response.status).toBe(404);
    expect(await equippedOf(OTHER_HERO)).toEqual({ weapon: null, armor: null });
  });

  it('存在しないcharacterIdは404', async () => {
    await setup();
    const response = await equipItem('no-such-character', null, null);
    expect(response.status).toBe(404);
  });

  it('characterId・weaponId・armorIdが無ければ断る', async () => {
    await setup();
    const response = await SELF.fetch('https://example.com/api/equip-item', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
