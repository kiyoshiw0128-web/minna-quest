import { describe, expect, it, vi } from 'vitest';
import type { Enemy, PartyMember, Skill } from '@mq/core';
import { fallbackBattlePlan, suggestBattlePlan } from '../src/aiBattlePlan.js';

const SLASH: Skill = {
  id: 'slash', name: '斬る', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 50 },
};
const FIRE: Skill = {
  id: 'fire', name: '火球', mpCost: 4, cooldown: 1, element: 'fire', target: 'enemy',
  damage: { kind: 'magical', power: 90 },
};
const HERO: PartyMember = {
  id: 'hero', name: '勇者', stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 14, mdf: 9, spd: 12 },
  skills: [SLASH, FIRE],
};
const ENEMY: Enemy = {
  id: 'slime', name: 'スライム', stats: { maxHp: 80, maxMp: 0, atk: 8, def: 5, mat: 2, mdf: 4, spd: 3 },
  skills: [SLASH], pattern: [{ skillId: 'slash' }],
};

function answers(choice: string, confidence = 0.8): Record<string, unknown> {
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
    `hero__${index + 1}`, { type: 'choice', choice, confidence, probabilities: {} },
  ]));
}

describe('Jevによる戦闘作戦', () => {
  it('装備中の技と待機だけを8ターンの作戦へ変換する', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ answers: {
      ...answers('fire'),
      hero__2: { type: 'choice', choice: 'wait', confidence: 0.7, probabilities: {} },
      hero__3: { type: 'choice', choice: 'not-equipped', confidence: 0.9, probabilities: {} },
    } }), { status: 200 }));
    const result = await suggestBattlePlan(ENEMY, [HERO], 'secret', fetcher);
    expect(result.source).toBe('jev');
    expect(result.plan.hero).toHaveLength(8);
    expect(result.plan.hero[0]).toBe('fire');
    expect(result.plan.hero[1]).toBeNull();
    expect(['slash', 'fire']).toContain(result.plan.hero[2]);

    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.model).toBe('jev-latest');
    expect(Object.keys(request.questions)).toHaveLength(8);
    expect(Object.keys(request.questions.hero__1.criteria)).toEqual(['slash', 'fire', 'wait']);
  });

  it.each([
    ['キー未設定', undefined, vi.fn()],
    ['低信頼の回答', 'secret', vi.fn(async () => new Response(JSON.stringify({ answers: answers('fire', 0.1) })))],
    ['API障害', 'secret', vi.fn(async () => new Response('{}', { status: 529 }))],
  ])('%sでは編集可能な基本作戦へ戻す', async (_name, key, fetcher) => {
    const result = await suggestBattlePlan(ENEMY, [HERO], key, fetcher as typeof fetch);
    expect(result).toEqual({ plan: fallbackBattlePlan([HERO]), source: 'fallback', confidence: null });
  });
});
