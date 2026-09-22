import { BOSS_INTERVAL, EVENTS, QUESTS } from '@mq/core';
import type { DailyEvent } from '@mq/core';

const table: Readonly<Record<string, DailyEvent>> = EVENTS;

export type ImmediateQuestCompletion = {
  name: string;
  tag: string;
  gold: number;
  resultText: string;
};

/** 依頼戦に勝った時、帰還用の最終イベントを待たずに適用する完了内容。 */
export function immediateQuestCompletion(eventId: string | null): ImmediateQuestCompletion | null {
  if (eventId === null) return null;
  const victoryTag = table[eventId]?.victoryTag;
  if (victoryTag === undefined) return null;
  const quest = QUESTS.find((candidate) => candidate.steps.some((step) => step.victoryTag === victoryTag));
  const finalStep = quest?.steps.at(-1);
  const finalEvent = finalStep === undefined ? undefined : table[finalStep.eventId];
  if (quest === undefined || finalStep === undefined || finalEvent === undefined) return null;
  return {
    name: quest.name,
    tag: finalStep.tag,
    gold: finalEvent.outcome?.gold ?? 0,
    resultText: finalEvent.resultText ?? `${quest.name}を完了した。`,
  };
}

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
