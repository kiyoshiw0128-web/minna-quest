import {
  EVENTS, applyOutcome, chapterOf, closeDay, daySeed, jstDayNumber, pickEvents, voteSeed,
} from '@mq/core';
import type { DailyEvent, WorldFlags } from '@mq/core';
import {
  getWorld, insertDay, listOpenDaysBefore, listVotes, markDayClosed, updateWorldProgress,
} from './store.js';

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
  // 万一 markDayClosed が進まない状況でも無限ループにならない。
  for (let guard = 0; guard < today; guard++) {
    const pending = await listOpenDaysBefore(db, worldId, today);
    const day = pending[0];
    if (day === undefined) break;

    const votes = await listVotes(db, worldId, day.dayNo);
    const resolved = closeDay(day, votes, voteSeed(worldId, day.dayNo));

    const didClose = await markDayClosed(db, worldId, resolved, now.toISOString());
    if (!didClose) continue; // すでに他が締めていた。正常な結果

    closedCount += 1;

    const chosen = POOL.find((event) => event.id === resolved.chosenId);
    if (chosen !== undefined) flags = applyOutcome(flags, chosen);

    const nextDayNo = day.dayNo + 1;
    flags = { ...flags, chapter: chapterOf(nextDayNo) };

    const options = pickEvents(POOL, flags, daySeed(worldId, nextDayNo));
    await insertDay(db, worldId, {
      dayNo: nextDayNo,
      optionIds: options.map((event) => event.id),
      chosenId: null,
      counts: null,
      tiebroken: null,
    });

    await updateWorldProgress(db, worldId, nextDayNo, flags.chapter, flags.tags);
  }

  return closedCount;
}
