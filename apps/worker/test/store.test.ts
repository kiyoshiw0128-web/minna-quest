import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import {
  getWorld, getDay, listOpenDaysBefore, listClosedDays, listVotes,
  insertDay, markDayClosed, updateWorldProgress, upsertVote,
  findPlayerByTokenHash, claimInvite, insertPlayer, advanceDay,
} from '../src/store.js';

const WORLD = 'w1';

async function seedWorld(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', '2026-09-03T15:00:00.000Z', 1, 1, '[]', '2026-09-03T15:00:00.000Z').run();
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
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

  it('進行度を更新できる', async () => {
    await updateWorldProgress(env.DB, WORLD, 8, 2, ['met-elder']);
    const world = await getWorld(env.DB, WORLD);
    expect(world?.currentDay).toBe(8);
    expect(world?.chapter).toBe(2);
    expect(world?.tags).toEqual(['met-elder']);
  });
});

describe('日', () => {
  it('入れて読めて、未締めなら null が並ぶ', async () => {
    await insertDay(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b', 'c'], chosenId: null, counts: null, tiebroken: null,
    });
    const day = await getDay(env.DB, WORLD, 1);
    expect(day).toEqual({
      dayNo: 1, optionIds: ['a', 'b', 'c'], chosenId: null, counts: null, tiebroken: null,
    });
  });

  it('締めると4つの列が同時に埋まる', async () => {
    await insertDay(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: null, counts: null, tiebroken: null,
    });
    const closed = await markDayClosed(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: 'a', counts: { a: 2, b: 1 }, tiebroken: false,
    }, '2026-09-04T20:00:00.000Z');
    expect(closed).toBe(true);

    const day = await getDay(env.DB, WORLD, 1);
    expect(day?.chosenId).toBe('a');
    expect(day?.counts).toEqual({ a: 2, b: 1 });
    expect(day?.tiebroken).toBe(false);
  });

  it('二度目の締めは0行で false を返し、結果を書き換えない', async () => {
    await insertDay(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: null, counts: null, tiebroken: null,
    });
    await markDayClosed(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: 'a', counts: { a: 1 }, tiebroken: false,
    }, '2026-09-04T20:00:00.000Z');

    const again = await markDayClosed(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: 'b', counts: { b: 9 }, tiebroken: true,
    }, '2026-09-05T20:00:00.000Z');

    expect(again).toBe(false);
    const day = await getDay(env.DB, WORLD, 1);
    expect(day?.chosenId).toBe('a');
    expect(day?.counts).toEqual({ a: 1 });
  });

  it('未締めの日を、指定した日より前だけ古い順に返す', async () => {
    for (const dayNo of [1, 2, 3, 4]) {
      await insertDay(env.DB, WORLD, {
        dayNo, optionIds: ['a'], chosenId: null, counts: null, tiebroken: null,
      });
    }
    await markDayClosed(env.DB, WORLD, {
      dayNo: 2, optionIds: ['a'], chosenId: 'a', counts: { a: 1 }, tiebroken: false,
    }, '2026-09-04T20:00:00.000Z');

    const open = await listOpenDaysBefore(env.DB, WORLD, 4);
    expect(open.map((day) => day.dayNo)).toEqual([1, 3]);
  });

  it('締めた日だけを古い順に返す', async () => {
    for (const dayNo of [1, 2]) {
      await insertDay(env.DB, WORLD, {
        dayNo, optionIds: ['a'], chosenId: null, counts: null, tiebroken: null,
      });
    }
    await markDayClosed(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a'], chosenId: 'a', counts: { a: 1 }, tiebroken: false,
    }, '2026-09-04T20:00:00.000Z');
    const closed = await listClosedDays(env.DB, WORLD);
    expect(closed.map((day) => day.dayNo)).toEqual([1]);
  });
});

describe('advanceDay', () => {
  it('負けたランナーの呼び出しは世界のタグと進行度を書き換えない', async () => {
    await insertDay(env.DB, WORLD, {
      dayNo: 1, optionIds: ['a', 'b'], chosenId: null, counts: null, tiebroken: null,
    });

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
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    expect(await listVotes(env.DB, WORLD, 1)).toEqual([{ playerId: 'p1', optionId: 'forest' }]);
  });

  it('同じ人の投票し直しは上書きになる', async () => {
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    await upsertVote(env.DB, WORLD, 1, 'p1', 'cave', '2026-09-04T01:00:00.000Z');
    const votes = await listVotes(env.DB, WORLD, 1);
    expect(votes).toHaveLength(1);
    expect(votes[0].optionId).toBe('cave');
  });

  it('別の日の票は混ざらない', async () => {
    await upsertVote(env.DB, WORLD, 1, 'p1', 'forest', '2026-09-04T00:00:00.000Z');
    await upsertVote(env.DB, WORLD, 2, 'p1', 'cave', '2026-09-05T00:00:00.000Z');
    expect(await listVotes(env.DB, WORLD, 1)).toHaveLength(1);
  });
});

describe('プレイヤーと招待', () => {
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

  it('未使用の招待は世界IDを返し、使用済みになる', async () => {
    await env.DB.prepare(
      `INSERT INTO invites (code_hash, world_id, created_at) VALUES (?, ?, ?)`,
    ).bind('c1', WORLD, '2026-09-03T00:00:00.000Z').run();

    const worldId = await claimInvite(env.DB, 'c1', 'p1', '2026-09-04T00:00:00.000Z');
    expect(worldId).toBe(WORLD);
  });

  it('同じ招待は二度使えない', async () => {
    await env.DB.prepare(
      `INSERT INTO invites (code_hash, world_id, created_at) VALUES (?, ?, ?)`,
    ).bind('c1', WORLD, '2026-09-03T00:00:00.000Z').run();

    await claimInvite(env.DB, 'c1', 'p1', '2026-09-04T00:00:00.000Z');
    expect(await claimInvite(env.DB, 'c1', 'p2', '2026-09-04T01:00:00.000Z')).toBeNull();
  });

  it('知らない招待は null', async () => {
    expect(await claimInvite(env.DB, 'nope', 'p1', '2026-09-04T00:00:00.000Z')).toBeNull();
  });
});
