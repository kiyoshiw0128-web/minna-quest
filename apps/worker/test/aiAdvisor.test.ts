import { describe, expect, it, vi } from 'vitest';
import type { Character, Recruit } from '@mq/core';
import { adviseLoadout, adviseRecruit } from '../src/aiAdvisor.js';

const APTITUDE = { maxHp: 'A', maxMp: 'B', atk: 'A', def: 'B', mat: 'C', mdf: 'C', spd: 'B' } as const;
const HERO: Character = {
  id: 'hero', name: '勇者', adventureLevel: 5, adventureExp: 0, aptitude: APTITUDE,
  currentJob: 'warrior', jobs: { warrior: { level: 5, exp: 0 } },
  learnedSkills: ['slash', 'provoke'], learnedPassives: ['battleInstinct'],
  equippedActive: ['slash'], equippedPassive: [], equippedWeapon: null, equippedArmor: null,
};
const RECRUITS: Recruit[] = [
  { id: 'r1', name: '戦士', jobId: 'warrior', aptitude: APTITUDE, adventureLevel: 3, cost: 300 },
  { id: 'r2', name: '僧侶', jobId: 'priest', aptitude: APTITUDE, adventureLevel: 2, cost: 250 },
];

function response(answers: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ answers }), { status: 200 }));
}

describe('Jevの育成助言', () => {
  it('現在のパーティを見て酒場候補を1人だけ推薦する', async () => {
    const fetcher = response({ recruit: { type: 'choice', choice: 'r2', confidence: 0.9, probabilities: { r1: 0.1, r2: 0.9 } } });
    await expect(adviseRecruit([HERO], RECRUITS, 500, 'secret', fetcher)).resolves.toEqual({
      recruitId: 'r2', source: 'jev', confidence: 0.9,
    });
    const request = JSON.parse((fetcher as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string);
    expect(request.model).toBe('jev-latest');
    expect(Object.keys(request.questions.recruit.criteria)).toEqual(['r1', 'r2']);
  });

  it('所持品と習得済みの範囲だけで装備構成を返す', async () => {
    const fetcher = response({
      weapon: { type: 'choice', choice: 'rustedSword', confidence: 0.8 },
      armor: { type: 'choice', choice: 'clothVest', confidence: 0.8 },
      'skill:slash': { type: 'choice', choice: 'equip', confidence: 0.9, probabilities: { equip: 0.9 } },
      'skill:provoke': { type: 'choice', choice: 'equip', confidence: 0.7, probabilities: { equip: 0.7 } },
      'passive:battleInstinct': { type: 'choice', choice: 'equip', confidence: 0.9, probabilities: { equip: 0.9 } },
    });
    const result = await adviseLoadout(HERO, ['rustedSword', 'clothVest'], 'secret', fetcher);
    expect(result).toMatchObject({ weaponId: 'rustedSword', armorId: 'clothVest',
      activeIds: ['slash', 'provoke'], passiveIds: ['battleInstinct'], source: 'jev' });
  });

  it('APIが使えない場合は現在の装備を保つ', async () => {
    const result = await adviseLoadout(HERO, ['rustedSword'], undefined);
    expect(result).toMatchObject({ weaponId: null, armorId: null, activeIds: ['slash'], passiveIds: [], source: 'fallback' });
  });
});
