import { describe, expect, it, vi } from 'vitest';
import { EVENTS } from '@mq/core';
import { guideStoryOptions } from '../src/storyGuide.js';

const candidates = [EVENTS.crossroads, EVENTS.restAtSpring, EVENTS.banditAmbush];
const context = { previous: EVENTS.meetElder, current: 'leaf' as const, flags: { chapter: 1, tags: ['met-elder'] } };

function response(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('TypeSafeによる物語候補の整列', () => {
  it('高確信の候補だけを先頭へ移し、候補集合は変えない', async () => {
    const fetcher = response({ answers: { next_event: { type: 'choice', choice: 'banditAmbush', confidence: 0.8,
      probabilities: { crossroads: 0.1, restAtSpring: 0.1, banditAmbush: 0.8 } } } });
    const result = await guideStoryOptions(candidates, context, 'secret', fetcher);
    expect(result.guided).toBe(true);
    expect(result.events.map((event) => event.id)).toEqual(['banditAmbush', 'crossroads', 'restAtSpring']);
    expect(new Set(result.events)).toEqual(new Set(candidates));
    const request = JSON.parse((fetcher as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(request.model).toBe('jev-latest');
    expect(Object.keys(request.questions.next_event.criteria)).toEqual(candidates.map((event) => event.id));
  });
  it('直近の物語と連続依頼の話数をJevへ渡す', async () => {
    const questCandidates = [EVENTS.millTracks, EVENTS.crossroads];
    const fetcher = response({ answers: { next_event: { type: 'choice', choice: 'millTracks', confidence: 0.9,
      probabilities: { millTracks: 0.9, crossroads: 0.1 } } } });
    await guideStoryOptions(questCandidates, {
      previous: EVENTS.millRequest, recent: [EVENTS.meetElder, EVENTS.millRequest],
      current: 'leaf', flags: { chapter: 1, tags: ['q-mill-1'] },
    }, 'secret', fetcher);
    const request = JSON.parse((fetcher as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(request.state.recent_story.map((event: { id: string }) => event.id)).toEqual(['meetElder', 'millRequest']);
    expect(request.questions.next_event.criteria.millTracks.quest).toMatchObject({
      name: '止まった水車', episode: 2, total_episodes: 4, is_continuation: true,
    });
  });
  it.each([
    ['キー未設定', undefined, response({})],
    ['低確信', 'secret', response({ answers: { next_event: { type: 'choice', choice: 'banditAmbush', confidence: 0.2, probabilities: {} } } })],
    ['候補外の応答', 'secret', response({ answers: { next_event: { type: 'choice', choice: 'unknown', confidence: 1, probabilities: {} } } })],
    ['APIエラー', 'secret', response({}, 529)],
  ])('%sでは従来順へフォールバックする', async (_name, key, fetcher) => {
    const result = await guideStoryOptions(candidates, context, key, fetcher);
    expect(result).toEqual({ events: candidates, guided: false });
  });
  it('通信例外でも締切処理へ例外を漏らさない', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    await expect(guideStoryOptions(candidates, context, 'secret', fetcher)).resolves.toEqual({ events: candidates, guided: false });
  });
});
