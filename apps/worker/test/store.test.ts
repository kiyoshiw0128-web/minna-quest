import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { createCharacter, JOBS } from '@mq/core';
import {
  getWorld, getDay, listOpenDaysBefore, listClosedDays, listVotes,
  upsertVote, findPlayerByTokenHash, insertPlayer, advanceDay, hireRecruit,
} from '../src/store.js';

const WORLD = 'w1';

async function seedWorld(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
}

async function insertOpenDay(dayNo: number, optionIds: readonly string[] = ['a']): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, ?, ?)`,
  ).bind(WORLD, dayNo, JSON.stringify(optionIds)).run();
}

async function closeDayRaw(
  dayNo: number, chosenId: string, counts: Record<string, number>, tiebroken: boolean, closedAt: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE world_days SET chosen_id = ?, counts = ?, tiebroken = ?, closed_at = ?
      WHERE world_id = ? AND day_no = ?`,
  ).bind(chosenId, JSON.stringify(counts), tiebroken ? 1 : 0, closedAt, WORLD, dayNo).run();
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['party', 'learned', 'job_levels', 'characters', 'votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await seedWorld();
});

describe('世界', () => {
  it('読めて、タグがJSONから配列に戻る', async () => {
    const world = await getWorld(env.DB, WORLD);
    expect(world?.name).toBe('テスト世界');
    expect(world?.tags).toEqual([]);
    expect(world?.currentDay).toBe(1);
  });

  it('無い世界は null', async () => {
    expect(await getWorld(env.DB, 'nope')).toBeNull();
  });
});

describe('日', () => {
  it('入れて読めて、未締めなら null が並ぶ', async () => {
    await insertOpenDay(1, ['a', 'b', 'c']);
    const day = await getDay(env.DB, WORLD, 1);
    expect(day).toEqual({
      dayNo: 1, optionIds: ['a', 'b', 'c'], chosenId: null, counts: null, tiebroken: null,
    });
  });

  it('未締めの日を、指定した日より前だけ古い順に返す', async () => {
    for (const dayNo of [1, 2, 3, 4]) {
      await insertOpenDay(dayNo);
    }
    await closeDayRaw(2, 'a', { a: 1 }, false, '2026-09-04T20:00:00.000Z');

    const open = await listOpenDaysBefore(env.DB, WORLD, 4);
    expect(open.map((day) => day.dayNo)).toEqual([1, 3]);
  });

  it('締めた日だけを古い順に返す', async () => {
    for (const dayNo of [1, 2]) {
      await insertOpenDay(dayNo);
    }
    await closeDayRaw(1, 'a', { a: 1 }, false, '2026-09-04T20:00:00.000Z');
    const closed = await listClosedDays(env.DB, WORLD);
    expect(closed.map((day) => day.dayNo)).toEqual([1]);
  });
});

describe('advanceDay', () => {
  it('負けたランナーの呼び出しは世界のタグと進行度を書き換えない', async () => {
    await insertOpenDay(1, ['a', 'b']);

    // 勝者が先に1日分丸ごと進める。
    const won = await advanceDay(
      env.DB, WORLD,
      { dayNo: 1, optionIds: ['a', 'b'], chosenId: 'a', counts: { a: 1 }, tiebroken: false },
      '2026-09-04T20:00:00.000Z',
      { dayNo: 2, optionIds: ['x', 'y', 'z'], chosenId: null, counts: null, tiebroken: null },
      { fromDay: 1, currentDay: 2, chapter: 1, tags: ['winner-tag'] },
    );
    expect(won).toBe(true);

    // 負けたランナーが同じ日を締めようとする。締めの文自体が0行になる。
    const lost = await advanceDay(
      env.DB, WORLD,
      { dayNo: 1, optionIds: ['a', 'b'], chosenId: 'b', counts: { b: 1 }, tiebroken: false },
      '2026-09-04T20:00:01.000Z',
      { dayNo: 2, optionIds: ['p', 'q', 'r'], chosenId: null, counts: null, tiebroken: null },
      { fromDay: 1, currentDay: 2, chapter: 2, tags: ['loser-tag'] },
    );
    expect(lost).toBe(false);

    const day1 = await getDay(env.DB, WORLD, 1);
    expect(day1?.chosenId).toBe('a');
    const day2 = await getDay(env.DB, WORLD, 2);
    expect(day2?.optionIds).toEqual(['x', 'y', 'z']);
    const world = await getWorld(env.DB, WORLD);
    expect(world?.currentDay).toBe(2);
    expect(world?.tags).toEqual(['winner-tag']);
  });
});

describe('投票', () => {
  it('入れて読める', async () => {
    await insertOpenDay(1);
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    expect(await listVotes(env.DB, WORLD, 1)).toEqual([{ playerId: 'p1', optionId: 'forest' }]);
  });

  it('同じ人の投票し直しは上書きになる', async () => {
    await insertOpenDay(1);
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    await upsertVote(env.DB, WORLD, 1, 'p1', 'cave', '2026-09-04T01:00:00.000Z');
    const votes = await listVotes(env.DB, WORLD, 1);
    expect(votes).toHaveLength(1);
    expect(votes[0].optionId).toBe('cave');
  });

  it('別の日の票は混ざらない', async () => {
    await insertOpenDay(1);
    await insertOpenDay(2);
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    await upsertVote(env.DB, WORLD, 2, 'p1', 'cave', '2026-09-05T00:00:00.000Z');
    expect(await listVotes(env.DB, WORLD, 1)).toHaveLength(1);
  });

  it('書き込めたら true を返す', async () => {
    await insertOpenDay(1);
    expect(await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z')).toBe(true);
  });

  it('締まった日への投票は書き込まれず false を返す（TOCTOU ガード）', async () => {
    await insertOpenDay(1);
    await closeDayRaw(1, 'forest', { forest: 0 }, true, '2026-09-04T20:00:00.000Z');

    const wrote = await upsertVote(env.DB, WORLD, 1, 'p1', 'cave', '2026-09-04T20:00:00.010Z');

    expect(wrote).toBe(false);
    expect(await listVotes(env.DB, WORLD, 1)).toEqual([]);
  });
});

describe('プレイヤー', () => {
  it('トークンのハッシュから引ける', async () => {
    await insertPlayer(env.DB, {
      id: 'p1', worldId: WORLD, name: 'テスト', tokenHash: 'h1', joinedAt: '2026-09-04T00:00:00.000Z',
    });
    const player = await findPlayerByTokenHash(env.DB, 'h1');
    expect(player).toEqual({ id: 'p1', worldId: WORLD, name: 'テスト' });
  });

  it('知らないハッシュは null', async () => {
    expect(await findPlayerByTokenHash(env.DB, 'nope')).toBeNull();
  });
});

describe('hireRecruit', () => {
  const APTITUDE = { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' } as const;

  async function seedPlayerWithGold(gold: number): Promise<void> {
    await insertPlayer(env.DB, {
      id: 'p1', worldId: WORLD, name: 'テスト', tokenHash: 'h-hire', joinedAt: '2026-09-04T00:00:00.000Z',
    });
    await env.DB.prepare('UPDATE players SET gold = ? WHERE id = ?').bind(gold, 'p1').run();
  }

  it('金貨が足りて枠もあれば、金貨を引いてキャラとパーティ枠を作る', async () => {
    await seedPlayerWithGold(100);
    const character = createCharacter({ id: 'c1', name: 'リクルート', aptitude: APTITUDE, job: 'warrior' }, JOBS);

    const hired = await hireRecruit(env.DB, { playerId: 'p1', cost: 80, character });
    expect(hired).toBe(true);

    const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind('p1').first<{ gold: number }>();
    expect(player?.gold).toBe(20);
    const party = await env.DB.prepare('SELECT character_id FROM party WHERE player_id = ?').bind('p1').first<{ character_id: string }>();
    expect(party?.character_id).toBe('c1');
  });

  // パーティが満杯のときにキャラの挿入が丸ごとスキップされることの検査。
  // ルート側（hire.ts）の事前チェックだけでこの経路を通ろうとすると、
  // 事前チェックで先に断られてしまい hireRecruit の中のガードを一度も通らない。
  // そのためここでは store の関数を直接叩いて、DB側のガードそのものを検査する。
  it(
    'パーティが満杯なら、金貨が足りていてもキャラは作られず金貨も減らない',
    async () => {
      await seedPlayerWithGold(1000);
      for (let slot = 0; slot < 4; slot++) {
        await env.DB.prepare('INSERT INTO party (player_id, character_id, slot) VALUES (?, ?, ?)')
          .bind('p1', `dummy-${slot}`, slot).run();
      }
      const character = createCharacter({ id: 'c-overflow', name: 'あぶれ', aptitude: APTITUDE, job: 'warrior' }, JOBS);

      const hired = await hireRecruit(env.DB, { playerId: 'p1', cost: 80, character });
      expect(hired).toBe(false);

      const player = await env.DB.prepare('SELECT gold FROM players WHERE id = ?').bind('p1').first<{ gold: number }>();
      // ガードが効いていれば1000のまま。characters の挿入INSERTから
      // 「金貨・枠」のWHERE条件を外すと、パーティが満杯でも金貨だけ引かれてしまう
      // （実際に外して確認済み。報告書参照）。
      expect(player?.gold).toBe(1000);

      const characterRow = await env.DB.prepare('SELECT id FROM characters WHERE id = ?').bind('c-overflow').first();
      expect(characterRow).toBeNull();
    },
  );
});
