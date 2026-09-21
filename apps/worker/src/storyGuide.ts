import { eventLocation, LOCATIONS, QUESTS } from '@mq/core';
import type { DailyEvent, LocationId, WorldFlags } from '@mq/core';

type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

type TypeSafeResponse = { answers?: { next_event?: ChoiceAnswer } };

export type StoryGuideResult = {
  events: readonly DailyEvent[];
  guided: boolean;
};

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MIN_CONFIDENCE = 0.35;
const TIMEOUT_MS = 2_500;

/**
 * 既存ロジックが安全に選んだ候補だけを、物語のつながりが自然な順に整える。
 * TypeSafeは候補の追加・削除やゲーム状態の更新をしない。失敗時は元の順番を返す。
 */
export async function guideStoryOptions(
  events: readonly DailyEvent[],
  context: { previous: DailyEvent | undefined; recent?: readonly DailyEvent[]; current: LocationId; flags: WorldFlags },
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<StoryGuideResult> {
  if (!apiKey || events.length < 2) return { events, guided: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const describe = (event: DailyEvent) => {
      const place = eventLocation(event.id);
      const quest = QUESTS.find((candidate) => candidate.steps.some((step) => step.eventId === event.id));
      const stepIndex = quest?.steps.findIndex((step) => step.eventId === event.id) ?? -1;
      return {
        id: event.id,
        name: event.name,
        kind: event.kind,
        location: place === null ? 'unknown' : LOCATIONS[place].name,
        quest: quest === undefined ? null : {
          name: quest.name,
          episode: stepIndex + 1,
          total_episodes: quest.steps.length,
          objective: quest.steps[stepIndex]?.objective ?? '',
          is_continuation: stepIndex > 0,
        },
      };
    };
    const response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          game: 'A shared daily fantasy adventure. Players vote on one next action.',
          chapter: context.flags.chapter,
          current_location: LOCATIONS[context.current].name,
          previous_event: context.previous ? {
            id: context.previous.id,
            name: context.previous.name,
            result: context.previous.resultText ?? '',
          } : null,
          recent_story: (context.recent ?? []).slice(-4).map((event) => ({
            id: event.id,
            name: event.name,
            result: event.resultText ?? '',
          })),
          established_story_tags: context.flags.tags,
          candidates: events.map((event) => ({
            ...describe(event),
            expected_scene: event.resultText ?? '',
          })),
        },
        questions: {
          next_event: {
            type: 'choice',
            instructions: {
              question: 'Which candidate is the most coherent and interesting immediate continuation of the established adventure?',
              rules: [
                'Choose only from `state.candidates`.',
                'Prefer the next episode of an unresolved quest over an unrelated standalone incident.',
                'Keep continuity with `state.recent_story`, especially named people, places, and unresolved consequences.',
                'Respect current location and established story tags.',
                'If several fit, prefer variety over repeating the previous kind of scene.',
              ],
            },
            criteria: Object.fromEntries(events.map((event) => [event.id, describe(event)])),
          },
        },
      }),
    });
    if (!response.ok) return { events, guided: false };
    const body = await response.json() as TypeSafeResponse;
    const answer = body.answers?.next_event;
    if (!answer || answer.type !== 'choice' || answer.confidence < MIN_CONFIDENCE) {
      return { events, guided: false };
    }
    const selected = events.find((event) => event.id === answer.choice);
    if (!selected) return { events, guided: false };
    return { events: [selected, ...events.filter((event) => event.id !== selected.id)], guided: true };
  } catch {
    return { events, guided: false };
  } finally {
    clearTimeout(timeout);
  }
}
