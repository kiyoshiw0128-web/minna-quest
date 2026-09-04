import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  env, applyD1Migrations, createScheduledController, createExecutionContext, waitOnExecutionContext,
} from 'cloudflare:test';
import worker from '../src/index.js';
import { getWorld, getDay } from '../src/store.js';

const BROKEN_WORLD = 'broken';
const OK_WORLD = 'ok';

// 実行時刻から25時間前を開始日にする。JST の日境界を必ず1回はまたぐので、
// `jstDayNumber` は必ず2以上になり、day 1 が「締めるべき未締めの日」になる。
// （scheduled は `new Date()` を直接使うため、テストから `now` を注入できない。）
const OK_STARTED = new Date(Date.now() - 25 * 3_600_000).toISOString();
const CREATED_AT = '2026-09-01T00:00:00.000Z';

async function seed(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const table of ['votes', 'world_days', 'players', 'invites', 'worlds']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  // startedAt が壊れている世界。jstDayNumber が例外を投げ、catchUp がそのまま失敗する。
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(BROKEN_WORLD, '壊れた世界', 'not-a-date', 1, 1, '[]', CREATED_AT).run();
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, 1, ?)`,
  ).bind(BROKEN_WORLD, JSON.stringify(['a', 'b', 'c'])).run();

  // 正常な世界。壊れた世界がループの途中で例外を投げても、これは締まって進むはず。
  await env.DB.prepare(
    `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(OK_WORLD, '正常な世界', OK_STARTED, 1, 1, '[]', CREATED_AT).run();
  await env.DB.prepare(
    `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (?, 1, ?)`,
  ).bind(OK_WORLD, JSON.stringify(['crossroads', 'restAtSpring', 'banditAmbush'])).run();
}

beforeEach(() => seed());

describe('scheduled', () => {
  it('1つの世界の締めが例外を投げても、他の世界は締めが進み、失敗はログに残る', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled?.(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    // 壊れた世界は例外を投げて締まっていない。世界のCPU時間を他がloopで消費されない。
    const broken = await getWorld(env.DB, BROKEN_WORLD);
    expect(broken?.currentDay).toBe(1);
    expect((await getDay(env.DB, BROKEN_WORLD, 1))?.chosenId).toBeNull();

    // 正常な世界は締めが進んでいる（何日進むかは実行時刻依存なので、1日目が
    // 締まったことと、進行度が初期値の1より進んだことだけを見る）。
    const ok = await getWorld(env.DB, OK_WORLD);
    expect(ok?.currentDay).toBeGreaterThan(1);
    expect((await getDay(env.DB, OK_WORLD, 1))?.chosenId).not.toBeNull();

    // 失敗は console.error に記録され、要約ログにも失敗件数が出る。
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(BROKEN_WORLD), expect.anything());
    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.startsWith('scheduled done') && line.includes('1 world(s) failed'))).toBe(true);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
