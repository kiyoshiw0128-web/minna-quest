import { describe, expect, it } from 'vitest';
import { EVENTS, QUESTS, applyOutcome, matchesCondition, questProgress, pickAdventureEvents } from '../../src/index.js';
import type { DailyEvent, WorldFlags } from '../../src/index.js';

const table: Readonly<Record<string, DailyEvent>> = EVENTS;

describe('街ごとの依頼', () => {
  it.each(QUESTS)('$name は受注・調査・実際の勝利・報告の順で完了する', (quest) => {
    let flags: WorldFlags = { chapter: 3, tags: [] };
    expect(questProgress(flags.tags)).toEqual([]);
    for (const [i, step] of quest.steps.entries()) {
      const event = table[step.eventId];
      expect(matchesCondition(event.condition, flags)).toBe(true);
      if (i > 0) {
        expect(questProgress(flags.tags).find((q) => q.id === quest.id)?.step.eventId).toBe(step.eventId);
        // 同じ地域に戻れば、依頼の続きを候補から取り落とさない。
        for (let seed = 0; seed < 20; seed++) {
          expect(pickAdventureEvents(Object.values(EVENTS), flags, seed, step.location).map((e) => e.id)).toContain(step.eventId);
        }
      }
      flags = applyOutcome(flags, event);
      expect(matchesCondition(event.condition, flags)).toBe(false);
      if (event.victoryTag) {
        expect(flags.tags).not.toContain(event.victoryTag);
        expect(questProgress(flags.tags).find((q) => q.id === quest.id)?.awaitingBattle).toBe(true);
        expect(matchesCondition(table[quest.steps[i + 1]!.eventId].condition, flags)).toBe(false);
        flags = { ...flags, tags: [...flags.tags, event.victoryTag] };
      }
    }
    expect(questProgress(flags.tags).find((q) => q.id === quest.id)?.completed).toBe(true);
  });
});
