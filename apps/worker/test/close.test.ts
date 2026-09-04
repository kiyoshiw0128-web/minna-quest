import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { catchUp } from '../src/close.js';
import { getDay, getWorld } from '../src/store.js';

const WORLD = 'w1';
const STARTED = '2026-09-03T15:00:00.000Z'; // 2026-09-04T00:00+09:00

/** 開始から dayNo 日目の JST 05:00 にあたる UTC 時刻。 */
function atDay(dayNo: number): Date {
  return new Date(Date.parse(STARTED) + (dayNo - 1) * 86_400_000 + 20 * 3_600_000);
}

async function seed(currentDay: number, openDays: number[]): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(WORLD, 'テスト世界', STARTED, currentDay, 1, '[]', STARTED).run();
  for (const dayNo of openDays) {
    await env.DB.prepare(
      `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, ?, ?)`,
    ).bind(WORLD, dayNo, JSON.stringify(['crossroads', 'restAtSpring', 'banditAmbush'])).run();
  }
}

beforeEach(() => seed(1, [1]));

describe('catchUp', () => {
  it('今日はまだ締めない', async () => {
    const closed = await catchUp(env.DB, WORLD, atDay(1));
    expect(closed).toBe(0);
    expect((await getDay(env.DB, WORLD, 1))?.chosenId).toBeNull();
  });

  it('翌日になると前日を締める', async () => {
    const closed = await catchUp(env.DB, WORLD, atDay(2));
    expect(closed).toBe(1);
    expect((await getDay(env.DB, WORLD, 1))?.chosenId).not.toBeNull();
  });

  it('締めると翌日の3択が用意される', async () => {
    await catchUp(env.DB, WORLD, atDay(2));
    const next = await getDay(env.DB, WORLD, 2);
    expect(next?.optionIds).toHaveLength(3);
    expect(next?.chosenId).toBeNull();
  });

  it('世界の進行度が進む', async () => {
    await catchUp(env.DB, WORLD, atDay(2));
    const world = await getWorld(env.DB, WORLD);
    expect(world?.currentDay).toBe(2);
  });

  it('票が入っていれば多数決が反映される', async () => {
    for (const [playerId, optionId] of [['p1', 'restAtSpring'], ['p2', 'restAtSpring'], ['p3', 'crossroads']]) {
      await env.DB.prepare(
        `INSERT INTO votes (world_id, day_no, player_id, option_id, voted_at) VALUES (?, 1, ?, ?, ?)`,
      ).bind(WORLD, playerId, optionId, '2026-09-04T00:00:00.000Z').run();
    }
    await catchUp(env.DB, WORLD, atDay(2));
    const day = await getDay(env.DB, WORLD, 1);
    expect(day?.chosenId).toBe('restAtSpring');
    expect(day?.counts).toEqual({ crossroads: 1, restAtSpring: 2, banditAmbush: 0 });
  });

  it('誰も投票しなくても締まって世界は進む', async () => {
    await catchUp(env.DB, WORLD, atDay(2));
    const day = await getDay(env.DB, WORLD, 1);
    expect(day?.chosenId).not.toBeNull();
    expect(day?.tiebroken).toBe(true);
  });

  it('二重に走らせても世界は二重に進まない', async () => {
    // cron を「もう1つ走らせる」を、ただの逐次呼び出しにすると機構を検証しない：
    // 1回目が day 1 を締めた後だと listOpenDaysBefore が day 1 をそもそも返さなく
    // なるので、2回目は advanceDay の締め用ガード（`AND chosen_id IS NULL`）に
    // 一度も触れずに 0 を返して「idempotent に見える」だけになる。
    // 実際に9章が求めている「4.3 の UPDATE が0行を返す」経路を踏ませるため、
    // 2回の catchUp を並行に走らせて、両方に同じ「day 1 は未締め」という
    // 読み取り結果を見せた上でガードを競わせる。
    const [first, second] = await Promise.all([
      catchUp(env.DB, WORLD, atDay(2)),
      catchUp(env.DB, WORLD, atDay(2)),
    ]);

    // どちらが先に書き込めるかは決まっていないので、順不同で1勝0敗を確認する。
    expect([first, second].sort((a, b) => b - a)).toEqual([1, 0]);

    const day1 = await getDay(env.DB, WORLD, 1);
    expect(day1?.chosenId).not.toBeNull();
    const world = await getWorld(env.DB, WORLD);
    expect(world?.currentDay).toBe(2);
  });

  it('溜まった日を古い順に取り戻す', async () => {
    await seed(1, [1]);
    const closed = await catchUp(env.DB, WORLD, atDay(4));
    expect(closed).toBe(3);
    for (const dayNo of [1, 2, 3]) {
      expect((await getDay(env.DB, WORLD, dayNo))?.chosenId).not.toBeNull();
    }
    expect((await getDay(env.DB, WORLD, 4))?.chosenId).toBeNull();
    expect((await getWorld(env.DB, WORLD))?.currentDay).toBe(4);
  });

  it('選んだイベントの結果がフラグに畳まれる', async () => {
    await seed(1, [1]);
    // meetElder を含む3択に差し替え、全員がそれを選ぶ
    await env.DB.prepare('UPDATE world_days SET option_ids = ? WHERE world_id = ? AND day_no = 1')
      .bind(JSON.stringify(['meetElder']), WORLD).run();
    await env.DB.prepare(
      `INSERT INTO votes (world_id, day_no, player_id, option_id, voted_at) VALUES (?, 1, 'p1', 'meetElder', ?)`,
    ).bind(WORLD, '2026-09-04T00:00:00.000Z').run();

    await catchUp(env.DB, WORLD, atDay(2));
    const world = await getWorld(env.DB, WORLD);
    expect(world?.tags).toContain('met-elder');
  });

  it('知らない世界では何も起きない', async () => {
    expect(await catchUp(env.DB, 'nope', atDay(2))).toBe(0);
  });
});
