import { describe, it, expect } from 'vitest';
import {
  isUnlocked,
  unlockedJobs,
  canChangeJob,
  changeJob,
  createCharacter,
} from '../../src/progression/unlock.js';
import type { JobTable } from '../../src/progression/exp.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const jobs: JobTable = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic', statBonus: {},
    learnset: [{ level: 1, kind: 'skill', id: 'slash' }],
    requires: [],
  },
  priest: {
    id: 'priest', name: '僧侶', tier: 'basic', statBonus: {},
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 1, kind: 'passive', id: 'calm' },
    ],
    requires: [],
  },
  paladin: {
    id: 'paladin', name: 'パラディン', tier: 'advanced', statBonus: {}, learnset: [],
    requires: [{ jobId: 'warrior', level: 20 }, { jobId: 'priest', level: 15 }],
  },
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 10, adventureExp: 40,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: ['slash'], learnedPassives: [],
    equippedActive: ['slash'], equippedPassive: [],
    ...over,
  };
}

const qualified = {
  jobs: {
    warrior: { level: 20, exp: 0 },
    priest: { level: 15, exp: 0 },
  },
};

describe('isUnlocked', () => {
  it('条件の無い職業は常に就ける', () => {
    expect(isUnlocked(character(), jobs['warrior'])).toBe(true);
  });

  it('条件を満たしていなければ就けない', () => {
    expect(isUnlocked(character(), jobs['paladin'])).toBe(false);
  });

  it('片方だけ満たしても就けない', () => {
    const half = character({ jobs: { warrior: { level: 20, exp: 0 } } });
    expect(isUnlocked(half, jobs['paladin'])).toBe(false);
  });

  it('すべて満たせば就ける', () => {
    expect(isUnlocked(character(qualified), jobs['paladin'])).toBe(true);
  });

  it('条件を超えていても就ける', () => {
    const over = character({ jobs: { warrior: { level: 30, exp: 0 }, priest: { level: 30, exp: 0 } } });
    expect(isUnlocked(over, jobs['paladin'])).toBe(true);
  });
});

describe('unlockedJobs', () => {
  it('就ける職業のIDを返す', () => {
    expect(unlockedJobs(character(), jobs)).toEqual(['warrior', 'priest']);
  });

  it('条件を満たすと上級職が増える', () => {
    expect(unlockedJobs(character(qualified), jobs)).toContain('paladin');
  });
});

describe('canChangeJob', () => {
  it('知らない職業には就けない', () => {
    expect(canChangeJob(character(), 'ninja', jobs)).toBe('unknownJob');
  });

  it('今就いている職業には転職できない', () => {
    expect(canChangeJob(character(), 'warrior', jobs)).toBe('alreadyCurrent');
  });

  it('条件を満たしていなければ locked', () => {
    expect(canChangeJob(character(), 'paladin', jobs)).toBe('locked');
  });

  it('条件を満たしていれば ok', () => {
    expect(canChangeJob(character(qualified), 'paladin', jobs)).toBe('ok');
  });
});

describe('changeJob', () => {
  it('転職しても冒険レベルは下がらない', () => {
    const result = changeJob(character(), 'priest', jobs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.adventureLevel).toBe(10);
    expect(result.character.adventureExp).toBe(40);
  });

  it('習得済みの技は消えない', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.learnedSkills).toContain('slash');
    expect(result.character.equippedActive).toContain('slash');
  });

  it('初めての職業はレベル1から始まる', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.currentJob).toBe('priest');
    expect(result.character.jobs['priest']).toEqual({ level: 1, exp: 0 });
  });

  it('前の職業の進み具合は残る', () => {
    const trained = character({ jobs: { warrior: { level: 12, exp: 300 } } });
    const result = changeJob(trained, 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.jobs['warrior']).toEqual({ level: 12, exp: 300 });
  });

  it('戻ってきたら以前の進み具合から再開する', () => {
    const both = character({
      currentJob: 'priest',
      jobs: { warrior: { level: 12, exp: 300 }, priest: { level: 3, exp: 10 } },
    });
    const result = changeJob(both, 'warrior', jobs);
    if (!result.ok) return;
    expect(result.character.jobs['warrior']).toEqual({ level: 12, exp: 300 });
  });

  it('就けない職業は理由つきで断る', () => {
    const result = changeJob(character(), 'paladin', jobs);
    expect(result).toEqual({ ok: false, reason: 'locked' });
  });

  it('初めての職業ではレベル1の技をその場で覚える', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.learnedSkills).toContain('holyLight');
    expect(result.character.learnedPassives).toContain('calm');
  });

  it('戻ってきたときは二重に覚えない', () => {
    const both = character({
      currentJob: 'priest',
      jobs: { warrior: { level: 12, exp: 300 }, priest: { level: 3, exp: 10 } },
      learnedSkills: ['slash', 'holyLight'],
    });
    const back = changeJob(both, 'warrior', jobs);
    if (!back.ok) return;
    expect(back.character.learnedSkills.filter((id) => id === 'slash')).toHaveLength(1);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    changeJob(before, 'priest', jobs);
    expect(before.currentJob).toBe('warrior');
    expect(before.jobs['priest']).toBeUndefined();
    expect(before.learnedSkills).toEqual(['slash']);
  });
});

describe('createCharacter', () => {
  it('冒険レベル1・ジョブレベル1から始まる', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.adventureLevel).toBe(1);
    expect(hero.adventureExp).toBe(0);
    expect(hero.jobs['warrior']).toEqual({ level: 1, exp: 0 });
    expect(hero.currentJob).toBe('warrior');
  });

  it('初期職のレベル1の技を覚えている', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.learnedSkills).toContain('slash');
  });

  it('覚えた技を最初から装備している', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.equippedActive).toContain('slash');
  });

  it('覚えたパッシブも装備している', () => {
    const hero = createCharacter({ id: 'h', name: '僧', aptitude: flat, job: 'priest' }, jobs);
    expect(hero.equippedPassive).toContain('calm');
  });

  it('知らない職業では作れない', () => {
    expect(() => createCharacter({ id: 'h', name: 'x', aptitude: flat, job: 'ninja' }, jobs))
      .toThrow('unknown job: ninja');
  });
});
