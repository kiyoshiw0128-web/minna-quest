import { describe, it, expect } from 'vitest';
import { env, SELF, applyD1Migrations } from 'cloudflare:test';
import type { BattleLog } from '@mq/core';
import { sha256Hex } from '../src/auth.js';

const WORLD = 'w1';
const TOKEN_A = 'arena-token-aaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'arena-token-bbbbbbbbbbbbbbbbbbbb';
const PLAYER_A = 'pA';
const PLAYER_B = 'pB';
const HERO_A = 'heroA';
const HERO_B = 'heroB';

const TABLES = [
  'arena_first', 'arena_progress', 'battle_results', 'party', 'learned',
  'job_levels', 'characters', 'votes', 'world_days', 'player_pets', 'players', 'invites', 'worlds',
];

/**
 * 闘技場は本編の日送りに依存しない（設計書 §2「いつでも、何度でも」）ので、
 * battle.test.ts の seedWorld と違って worlds/world_days は1行あれば足りる。
 */
async function seedWorld(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of TABLES) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, 1, 1, '[]', ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', '2026-09-03T15:00:00.000Z').run();
}

async function addPlayer(playerId: string, token: string, gold = 0): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO players (id, world_id, name, token_hash, joined_at, gold) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(playerId, WORLD, playerId, await sha256Hex(token), '2026-09-04T00:00:00.000Z', gold).run();
}

/**
 * 1階(arenaAspirant, HP212・DEF10)を「斬りつける」の連打だけで確実に倒せる
 * 強さのキャラをパーティ枠0に作る。battle.test.ts の seedWinningHero と
 * 同じ考え方（バランス値のテストではなく配線の検査なので、圧勝できれば足りる）。
 */
async function seedWinningHero(playerId: string, characterId: string): Promise<void> {
  const aptitude = JSON.stringify({ maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A' });
  const skills = ['slash'];
  await env.DB.prepare(
    `INSERT INTO characters
       (id, player_id, name, adventure_level, adventure_exp, aptitude, current_job, equipped_active, equipped_passive)
     VALUES (?, ?, ?, 50, 0, ?, 'warrior', ?, '[]')`,
  ).bind(characterId, playerId, characterId, aptitude, JSON.stringify(skills)).run();
  await env.DB.prepare(
    `INSERT INTO job_levels (character_id, job_id, level, exp) VALUES (?, 'warrior', 30, 0)`,
  ).bind(characterId).run();
  for (const skillId of skills) {
    await env.DB.prepare(`INSERT INTO learned (character_id, kind, id) VALUES (?, 'skill', ?)`).bind(characterId, skillId).run();
  }
  await env.DB.prepare(`INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, 0)`).bind(playerId, characterId).run();
}

const SLASH_PLAN = Array.from({ length: 8 }, () => 'slash');
const NO_ACTION_PLAN = Array.from({ length: 8 }, (): null => null);

function arenaGet(token: string, floor?: number): Promise<Response> {
  const query = floor === undefined ? '' : `?floor=${floor}`;
  return SELF.fetch(`https://example.com/api/arena${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function arenaPost(token: string, floor: unknown, plan: Record<string, (string | null)[]>): Promise<Response> {
  return SELF.fetch('https://example.com/api/arena', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ floor, plan }),
  });
}

function rankingGet(token: string): Promise<Response> {
  return SELF.fetch('https://example.com/api/arena/ranking', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string };

async function readOk<T>(response: Response): Promise<T> {
  const payload = await response.json<Ok<T> | Fail>();
  if (!payload.ok) throw new Error(`expected ok response, got: ${JSON.stringify(payload)}`);
  return payload.data;
}

type ArenaFloorInfo = { floor: number; opened: boolean; clearedAt: string | null; firstClearedBy: string | null };
type ArenaGetData = {
  reachedFloor: number;
  challengeFloor: number | null;
  floors: ArenaFloorInfo[];
  targetFloor: number | null;
  enemy: { id: string; name: string; pattern: { skillId: string }[] } | null;
  party: { id: string }[];
};

describe('GET /api/arena（設計書 §5・§8 テスト1）', () => {
  it('1階は最初から挑める', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<ArenaGetData>(await arenaGet(TOKEN_A));
    expect(data.reachedFloor).toBe(0);
    expect(data.challengeFloor).toBe(1);
    expect(data.targetFloor).toBe(1);
    expect(data.enemy?.id).toBe('arenaAspirant');
    expect(data.floors[0]).toMatchObject({ floor: 1, opened: true });
    expect(data.floors[1]).toMatchObject({ floor: 2, opened: false });
  });

  it('2階は1階を倒すまで挑めない（GETでも敵情報が無い）', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<ArenaGetData>(await arenaGet(TOKEN_A, 2));
    expect(data.targetFloor).toBeNull();
    expect(data.enemy).toBeNull();
  });

  it('認証が無ければ401', async () => {
    await seedWorld();
    const response = await SELF.fetch('https://example.com/api/arena');
    expect(response.status).toBe(401);
  });
});

describe('到達階は arena_progress の最大値から求まる（設計書 §4・§8 テスト3）', () => {
  it('複数階を倒した後、到達階はその最大値になる', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    for (const floor of [1, 2, 3]) {
      await env.DB.prepare(
        `INSERT INTO arena_progress (player_id, floor, cleared_at) VALUES (?, ?, ?)`,
      ).bind(PLAYER_A, floor, '2026-09-04T00:00:00.000Z').run();
    }

    const data = await readOk<ArenaGetData>(await arenaGet(TOKEN_A));
    expect(data.reachedFloor).toBe(3);
    expect(data.challengeFloor).toBe(4);
    // 行の最大値がそのまま基準になるので、順不同に挿しても崩れない。
    expect(data.floors.filter((f) => f.opened).map((f) => f.floor)).toEqual([1, 2, 3, 4]);
  });
});

describe('POST /api/arena（設計書 §5・§8 テスト1・2）', () => {
  it('開いていない階は断る', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const response = await arenaPost(TOKEN_A, 2, { [HERO_A]: NO_ACTION_PLAN });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'floor not open' });
  });

  it('勝てば報酬が入り、arena_progress に記録される', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await seedWinningHero(PLAYER_A, HERO_A);

    const data = await readOk<{ log: BattleLog; rewarded: boolean; firstClear: boolean }>(
      await arenaPost(TOKEN_A, 1, { [HERO_A]: SLASH_PLAN }),
    );
    expect(data.log.result).toBe('win');
    expect(data.rewarded).toBe(true);
    expect(data.firstClear).toBe(true);

    const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>();
    expect(player?.gold).toBe(50); // ARENA_FLOORS[0].reward.gold（packages/core/src/data/arena.ts）

    const progress = await env.DB.prepare('SELECT floor, cleared_at FROM arena_progress WHERE player_id = ?').bind(PLAYER_A).all();
    expect(progress.results).toHaveLength(1);

    const first = await env.DB.prepare('SELECT player_id FROM arena_first WHERE floor = 1').first<{ player_id: string }>();
    expect(first?.player_id).toBe(PLAYER_A);
  });

  it('倒した階には何度でも挑めるが、2回目以降は報酬が入らない（8テスト2）', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await seedWinningHero(PLAYER_A, HERO_A);

    const first = await readOk<{ rewarded: boolean }>(await arenaPost(TOKEN_A, 1, { [HERO_A]: SLASH_PLAN }));
    expect(first.rewarded).toBe(true);
    const goldAfterFirst = (await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>())?.gold;

    const second = await readOk<{ rewarded: boolean; firstClear: boolean }>(
      await arenaPost(TOKEN_A, 1, { [HERO_A]: SLASH_PLAN }),
    );
    expect(second.rewarded).toBe(false);
    expect(second.firstClear).toBe(false);

    const goldAfterSecond = (await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>())?.gold;
    expect(goldAfterSecond).toBe(goldAfterFirst); // 増えていない

    const progress = await env.DB.prepare('SELECT COUNT(*) AS n FROM arena_progress WHERE player_id = ? AND floor = 1').bind(PLAYER_A).first<{ n: number }>();
    expect(progress?.n).toBe(1); // 行も1つのまま
  });

  it('負けても罰は無く、arena_progress には何も残らない', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 1000);
    await seedWinningHero(PLAYER_A, HERO_A);

    await arenaPost(TOKEN_A, 1, { [HERO_A]: NO_ACTION_PLAN });

    const gold = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_A).first<{ gold: number }>();
    expect(gold?.gold).toBe(1000);
    const progress = await env.DB.prepare('SELECT COUNT(*) AS n FROM arena_progress').first<{ n: number }>();
    expect(progress?.n).toBe(0);
  });

  it('認証が無ければ401', async () => {
    await seedWorld();
    const response = await SELF.fetch('https://example.com/api/arena', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ floor: 1, plan: {} }),
    });
    expect(response.status).toBe(401);
  });
});

/**
 * 段階6・設計書 §6「本編の戦闘と闘技場の両方に同じように効かせる」の闘技場側
 * （設計書 §8 テスト7）。battle.test.ts と同じ考え方で、勝敗ではなく
 * 1発のダメージ量で「効果がかかったこと」だけを見る。
 */
describe('ペットの効果は闘技場にも同じようにかかる（設計書 §6・§8 テスト7）', () => {
  async function firstDamageToEnemyAmount(token: string): Promise<number> {
    const data = await readOk<{ log: BattleLog }>(
      await arenaPost(token, 1, { [HERO_A]: ['slash', null, null, null, null, null, null, null] }),
    );
    const damage = data.log.events.find((event) => event.t === 'damage' && event.targetId !== HERO_A);
    if (damage === undefined || damage.t !== 'damage') throw new Error('攻撃のダメージイベントが無い');
    return damage.amount;
  }

  it('連れているペットの効果でダメージが変わる', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);

    const withoutPet = await firstDamageToEnemyAmount(TOKEN_A);

    await env.DB.prepare(
      `INSERT INTO player_pets (player_id, pet_id, obtained_at) VALUES (?, 'puppy', ?)`,
    ).bind(PLAYER_A, '2026-09-04T00:00:00.000Z').run();
    await env.DB.prepare('UPDATE players SET active_pet_id = ? WHERE id = ?').bind('puppy', PLAYER_A).run();

    const withPet = await firstDamageToEnemyAmount(TOKEN_A);

    // puppy は atk +15%（packages/core/src/data/pets.ts）。
    expect(withPet).toBeGreaterThan(withoutPet);
  });
});

describe('最初に倒した人の記録は上書きされない（設計書 §4・§8 テスト4）', () => {
  it('2人目が同じ階を初めて倒しても、arena_first は最初の1人のまま', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await addPlayer(PLAYER_B, TOKEN_B, 0);
    await seedWinningHero(PLAYER_A, HERO_A);
    await seedWinningHero(PLAYER_B, HERO_B);

    const dataA = await readOk<{ firstClear: boolean }>(await arenaPost(TOKEN_A, 1, { [HERO_A]: SLASH_PLAN }));
    expect(dataA.firstClear).toBe(true);

    const dataB = await readOk<{ firstClear: boolean }>(await arenaPost(TOKEN_B, 1, { [HERO_B]: SLASH_PLAN }));
    expect(dataB.firstClear).toBe(false); // 自分にとっては初クリアだが、世界初ではない

    const first = await env.DB.prepare('SELECT player_id FROM arena_first WHERE floor = 1').first<{ player_id: string }>();
    expect(first?.player_id).toBe(PLAYER_A);

    // Bも自分自身の報酬・進捗はちゃんと受け取っている（別物であることの確認）。
    const progressB = await env.DB.prepare('SELECT COUNT(*) AS n FROM arena_progress WHERE player_id = ? AND floor = 1').bind(PLAYER_B).first<{ n: number }>();
    expect(progressB?.n).toBe(1);
    const goldB = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_B).first<{ gold: number }>();
    expect(goldB?.gold).toBe(50);
  });
});

describe('19階を倒すまで20階に挑めず、敵の情報も返らない（設計書 §3.3・§8 テスト5）', () => {
  it('19階未クリアなら GET は20階の敵を返さない', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);
    for (let floor = 1; floor <= 18; floor += 1) {
      await env.DB.prepare(
        `INSERT INTO arena_progress (player_id, floor, cleared_at) VALUES (?, ?, ?)`,
      ).bind(PLAYER_A, floor, '2026-09-04T00:00:00.000Z').run();
    }

    const data = await readOk<ArenaGetData>(await arenaGet(TOKEN_A, 20));
    expect(data.targetFloor).toBeNull();
    expect(data.enemy).toBeNull();
    // 敵オブジェクトごと無い。名前だけ抜き出して確認する回り道自体ができない。
    expect(JSON.stringify(data)).not.toContain('深淵の覇王'); // ABYSSAL_SOVEREIGN.name（packages/core/src/data/arena.ts）
    expect(data.floors[19]).toMatchObject({ floor: 20, opened: false });
  });

  it('19階未クリアなら POST も20階を断る', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);
    for (let floor = 1; floor <= 18; floor += 1) {
      await env.DB.prepare(
        `INSERT INTO arena_progress (player_id, floor, cleared_at) VALUES (?, ?, ?)`,
      ).bind(PLAYER_A, floor, '2026-09-04T00:00:00.000Z').run();
    }

    const response = await arenaPost(TOKEN_A, 20, { [HERO_A]: NO_ACTION_PLAN });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'floor not open' });
  });

  it('19階までクリア済みなら20階の敵情報が見える', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A);
    await seedWinningHero(PLAYER_A, HERO_A);
    for (let floor = 1; floor <= 19; floor += 1) {
      await env.DB.prepare(
        `INSERT INTO arena_progress (player_id, floor, cleared_at) VALUES (?, ?, ?)`,
      ).bind(PLAYER_A, floor, '2026-09-04T00:00:00.000Z').run();
    }

    const data = await readOk<ArenaGetData>(await arenaGet(TOKEN_A, 20));
    expect(data.targetFloor).toBe(20);
    expect(data.enemy).not.toBeNull();
  });
});

describe('他人の進捗を書き換えられない（設計書 §8 テスト9）', () => {
  it('自分の勝利は他人の金貨・進捗に影響しない', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await addPlayer(PLAYER_B, TOKEN_B, 777);
    await seedWinningHero(PLAYER_A, HERO_A);

    await arenaPost(TOKEN_A, 1, { [HERO_A]: SLASH_PLAN });

    const goldB = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind(PLAYER_B).first<{ gold: number }>();
    expect(goldB?.gold).toBe(777); // Bの金貨は一切動かない

    const progressB = await env.DB.prepare('SELECT COUNT(*) AS n FROM arena_progress WHERE player_id = ?').bind(PLAYER_B).first<{ n: number }>();
    expect(progressB?.n).toBe(0); // Bの進捗も一切増えない
  });
});

describe('GET /api/arena/ranking（設計書 §5・§6「他人がどこまで登ったか」）', () => {
  it('世界の全員の到達階が見える', async () => {
    await seedWorld();
    await addPlayer(PLAYER_A, TOKEN_A, 0);
    await addPlayer(PLAYER_B, TOKEN_B, 0);
    await seedWinningHero(PLAYER_A, HERO_A);
    await seedWinningHero(PLAYER_B, HERO_B);

    await env.DB.prepare(
      `INSERT INTO arena_progress (player_id, floor, cleared_at) VALUES (?, 1, ?), (?, 2, ?)`,
    ).bind(PLAYER_A, '2026-09-04T00:00:00.000Z', PLAYER_A, '2026-09-04T00:00:00.000Z').run();

    const data = await readOk<{ ranking: { playerId: string; reachedFloor: number }[] }>(await rankingGet(TOKEN_B));
    const byId = new Map(data.ranking.map((row) => [row.playerId, row.reachedFloor]));
    expect(byId.get(PLAYER_A)).toBe(2);
    expect(byId.get(PLAYER_B)).toBe(0); // 1階も倒していなくても出てくる
  });
});
