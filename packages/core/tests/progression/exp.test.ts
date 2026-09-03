import { describe, it, expect } from 'vitest';
import { gainExp, applyLearns } from '../../src/progression/exp.js';
import type { JobTable } from '../../src/progression/exp.js';
import { MAX_ADVENTURE_LEVEL, MAX_JOB_LEVEL } from '../../src/progression/curve.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const jobs: JobTable = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic', statBonus: { atk: 3 },
    learnset: [
      { level: 2, kind: 'skill', id: 'heavyBlow' },
      { level: 3, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [],
  },
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 1, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: [], learnedPassives: [],
    equippedActive: [], equippedPassive: [],
    ...over,
  };
}

describe('gainExp - 冒険レベル', () => {
  it('足りなければ経験値だけ溜まる', () => {
    const { character: after, events } = gainExp(character(), { adventure: 10, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(1);
    expect(after.adventureExp).toBe(10);
    expect(events).toHaveLength(0);
  });

  it('足りればレベルが上がり、余りは持ち越す', () => {
    const { character: after, events } = gainExp(character(), { adventure: 70, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(2);
    expect(after.adventureExp).toBe(10);
    expect(events).toContainEqual({ t: 'adventureLevelUp', level: 2 });
  });

  it('一度に複数レベル上がる', () => {
    const { character: after } = gainExp(character(), { adventure: 10000, job: 0 }, jobs);
    expect(after.adventureLevel).toBeGreaterThan(3);
  });

  it('上限で止まり、余った経験値は捨てる', () => {
    const maxed = character({ adventureLevel: MAX_ADVENTURE_LEVEL });
    const { character: after } = gainExp(maxed, { adventure: 999999, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(MAX_ADVENTURE_LEVEL);
    expect(after.adventureExp).toBe(0);
  });
});

describe('gainExp - ジョブレベルと習得', () => {
  it('ジョブレベルが上がると技を覚える', () => {
    const { character: after, events } = gainExp(character(), { adventure: 0, job: 30 }, jobs);
    expect(after.jobs['warrior'].level).toBe(2);
    expect(after.learnedSkills).toContain('heavyBlow');
    expect(events).toContainEqual({ t: 'jobLevelUp', jobId: 'warrior', level: 2 });
    expect(events).toContainEqual({ t: 'skillLearned', skillId: 'heavyBlow' });
  });

  it('パッシブも覚える', () => {
    const { character: after, events } = gainExp(character(), { adventure: 0, job: 500 }, jobs);
    expect(after.learnedPassives).toContain('ironSkin');
    expect(events).toContainEqual({ t: 'passiveLearned', passiveId: 'ironSkin' });
  });

  it('複数レベル上がったら途中のものも全部覚える', () => {
    const { character: after } = gainExp(character(), { adventure: 0, job: 500 }, jobs);
    expect(after.learnedSkills).toContain('heavyBlow');
    expect(after.learnedPassives).toContain('ironSkin');
  });

  it('すでに覚えているものを二重に足さない', () => {
    const known = character({ learnedSkills: ['heavyBlow'] });
    const { character: after, events } = gainExp(known, { adventure: 0, job: 30 }, jobs);
    expect(after.learnedSkills.filter((id) => id === 'heavyBlow')).toHaveLength(1);
    expect(events).not.toContainEqual({ t: 'skillLearned', skillId: 'heavyBlow' });
  });

  it('経験値は現在の職業にだけ入る', () => {
    const two = character({
      jobs: { warrior: { level: 1, exp: 0 }, mage: { level: 5, exp: 100 } },
    });
    const { character: after } = gainExp(two, { adventure: 0, job: 30 }, jobs);
    expect(after.jobs['mage']).toEqual({ level: 5, exp: 100 });
  });

  it('ジョブレベルの上限で止まる', () => {
    const maxed = character({ jobs: { warrior: { level: MAX_JOB_LEVEL, exp: 0 } } });
    const { character: after } = gainExp(maxed, { adventure: 0, job: 999999 }, jobs);
    expect(after.jobs['warrior'].level).toBe(MAX_JOB_LEVEL);
    expect(after.jobs['warrior'].exp).toBe(0);
  });
});

describe('gainExp - 不変性', () => {
  it('元のキャラを書き換えない', () => {
    const before = character();
    gainExp(before, { adventure: 10000, job: 10000 }, jobs);
    expect(before.adventureLevel).toBe(1);
    expect(before.learnedSkills).toHaveLength(0);
    expect(before.jobs['warrior'].level).toBe(1);
  });
});

describe('applyLearns', () => {
  it('技とパッシブを両方反映する', () => {
    const { character: after, events } = applyLearns(character(), [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 1, kind: 'passive', id: 'ironSkin' },
    ]);
    expect(after.learnedSkills).toEqual(['slash']);
    expect(after.learnedPassives).toEqual(['ironSkin']);
    expect(events).toHaveLength(2);
  });

  it('すでに覚えているものは足さず、イベントも出さない', () => {
    const known = character({ learnedSkills: ['slash'] });
    const { character: after, events } = applyLearns(known, [
      { level: 1, kind: 'skill', id: 'slash' },
    ]);
    expect(after.learnedSkills).toEqual(['slash']);
    expect(events).toHaveLength(0);
  });

  it('空の表なら何も起きない', () => {
    const { events } = applyLearns(character(), []);
    expect(events).toHaveLength(0);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    applyLearns(before, [{ level: 1, kind: 'skill', id: 'slash' }]);
    expect(before.learnedSkills).toHaveLength(0);
  });
});
