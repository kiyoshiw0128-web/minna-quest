import { QUESTS } from '../data/quests.js';
import type { QuestStep } from '../data/quests.js';

export type QuestProgress = {
  id: string;
  name: string;
  completed: boolean;
  awaitingBattle: boolean;
  step: QuestStep;
};

export function questProgress(tags: readonly string[]): QuestProgress[] {
  return QUESTS.filter((quest) => tags.includes(quest.steps[0]!.tag)).map((quest) => {
    const pending = quest.steps.find((step) => !tags.includes(step.tag)
      || (step.victoryTag !== undefined && !tags.includes(step.victoryTag)));
    const step = pending ?? quest.steps[quest.steps.length - 1]!;
    return {
      id: quest.id, name: quest.name, completed: pending === undefined, step,
      awaitingBattle: step.victoryTag !== undefined && tags.includes(step.tag) && !tags.includes(step.victoryTag),
    };
  });
}
