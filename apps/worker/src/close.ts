import {
  EVENTS, applyOutcome, chapterOf, closeDay, daySeed, jstDayNumber, pickEvents, voteSeed,
} from '@mq/core';
import type { DailyEvent, WorldFlags } from '@mq/core';
import { advanceDay, getWorld, listOpenDaysBefore, listVotes } from './store.js';

const POOL: readonly DailyEvent[] = Object.values(EVENTS);

/**
 * 締めていない日を古い順に締めて、世界を今日まで進める。締めた日数を返す。
 *
 * 締める対象は「今日より前の、まだ締めていない日」だけ。今日そのものは
 * まだ投票を受け付けている最中なので締めない。
 *
 * 1日ずつ処理するのは、途中で失敗したときにどこまで進んだかがDBに残るようにするため。
 * 次の起動が続きから再開する。
 */
export async function catchUp(db: D1Database, worldId: string, now: Date): Promise<number> {
  const world = await getWorld(db, worldId);
  if (world === null) return 0;

  const today = jstDayNumber(world.startedAt, now);

  let flags: WorldFlags = { chapter: world.chapter, tags: world.tags };
  let closedCount = 0;

  // 対象が無くなるまで繰り返す。1日締めるたびに翌日の行が増えるので、
  // 一覧は毎回引き直す。回数の上限は「今日より前の日数」で、
  // 万一 advanceDay が進まない状況でも無限ループにならない。
  for (let guard = 0; guard < today; guard++) {
    const pending = await listOpenDaysBefore(db, worldId, today);
    const day = pending[0];
    if (day === undefined) break;

    const votes = await listVotes(db, worldId, day.dayNo);
    const resolved = closeDay(day, votes, voteSeed(worldId, day.dayNo));

    const chosen = POOL.find((event) => event.id === resolved.chosenId);
    const nextFlags: WorldFlags = chosen === undefined ? flags : applyOutcome(flags, chosen);

    const nextDayNo = day.dayNo + 1;
    const advancedFlags: WorldFlags = { ...nextFlags, chapter: chapterOf(nextDayNo) };

    const options = pickEvents(POOL, advancedFlags, daySeed(worldId, nextDayNo));

    const didAdvance = await advanceDay(
      db,
      worldId,
      resolved,
      now.toISOString(),
      { dayNo: nextDayNo, optionIds: options.map((event) => event.id), chosenId: null, counts: null, tiebroken: null },
      { fromDay: day.dayNo, currentDay: nextDayNo, chapter: advancedFlags.chapter, tags: advancedFlags.tags },
    );
    // すでに他が締めていた。正常な結果。ローカルの flags はもう古いので、
    // ここで止めて次回の起動に読み直しから任せる。
    if (!didAdvance) break;

    closedCount += 1;
    flags = advancedFlags;
  }

  return closedCount;
}
