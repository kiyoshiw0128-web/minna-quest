import { BOSS_INTERVAL, EVENTS } from '@mq/core';
import type { DailyEvent } from '@mq/core';

const table: Readonly<Record<string, DailyEvent>> = EVENTS;

/** 勝利フラグは討伐記録から導出。投票・敗北だけでは依頼を達成させない。 */
export async function questVictoryTags(db: D1Database, worldId: string): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT DISTINCT chosen_id FROM world_days
      WHERE world_id = ? AND defeated_by IS NOT NULL AND day_no % ? != 0`,
  ).bind(worldId, BOSS_INTERVAL).all<{ chosen_id: string }>();
  return [...new Set(rows.results.flatMap((row) => {
    const tag = table[row.chosen_id]?.victoryTag;
    return tag === undefined ? [] : [tag];
  }))];
}
