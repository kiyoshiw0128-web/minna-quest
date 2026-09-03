import { describe, it, expect } from 'vitest';
import { computeStats, BASE_STATS } from '../../src/progression/stats.js';
import type { Character, Aptitude } from '../../src/progression/types.js';
import type { Job } from '../../src/progression/job.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const warrior: Job = {
  id: 'warrior', name: '戦士', tier: 'basic',
  statBonus: { atk: 3, def: 2, maxHp: 8 },
  learnset: [], requires: [],
};

const noBonus: Job = {
  id: 'blank', name: '無', tier: 'basic', statBonus: {}, learnset: [], requires: [],
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

describe('computeStats', () => {
  it('冒険レベル1・ジョブレベル1では素の値に職業補正が1回だけ乗る', () => {
    const stats = computeStats(character(), warrior);
    expect(stats.atk).toBe(BASE_STATS.atk + 3);
    expect(stats.def).toBe(BASE_STATS.def + 2);
  });

  it('職業補正の無い職業では素の値そのもの', () => {
    const stats = computeStats(character({ currentJob: 'blank', jobs: { blank: { level: 1, exp: 0 } } }), noBonus);
    expect(stats.atk).toBe(BASE_STATS.atk);
    expect(stats.maxHp).toBe(BASE_STATS.maxHp);
  });

  it('冒険レベルが上がると伸びる', () => {
    const low = computeStats(character(), noBonus);
    const high = computeStats(character({ adventureLevel: 10, currentJob: 'blank', jobs: { blank: { level: 1, exp: 0 } } }), noBonus);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
  });

  it('素質が高いほど冒険レベルの伸びが大きい', () => {
    const talented: Aptitude = { ...flat, atk: 'A' };
    const weak: Aptitude = { ...flat, atk: 'E' };
    const base = { adventureLevel: 20, currentJob: 'blank' as const, jobs: { blank: { level: 1, exp: 0 } } };
    const a = computeStats(character({ ...base, aptitude: talented }), noBonus);
    const e = computeStats(character({ ...base, aptitude: weak }), noBonus);
    expect(a.atk).toBeGreaterThan(e.atk);
  });

  it('素質は素の値には掛からない（レベル1では差が出ない）', () => {
    const talented: Aptitude = { ...flat, atk: 'A' };
    const base = { currentJob: 'blank' as const, jobs: { blank: { level: 1, exp: 0 } } };
    const a = computeStats(character({ ...base, aptitude: talented }), noBonus);
    const c = computeStats(character({ ...base }), noBonus);
    expect(a.atk).toBe(c.atk);
  });

  it('ジョブレベルに比例して職業補正が乗る', () => {
    const lv1 = computeStats(character(), warrior);
    const lv10 = computeStats(character({ jobs: { warrior: { level: 10, exp: 0 } } }), warrior);
    expect(lv10.atk - lv1.atk).toBe(27);
  });

  it('すべて整数を返す', () => {
    const stats = computeStats(character({ adventureLevel: 33 }), warrior);
    for (const value of Object.values(stats)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('どのステータスも1を下回らない', () => {
    const stats = computeStats(character(), noBonus);
    for (const value of Object.values(stats)) {
      expect(value).toBeGreaterThanOrEqual(1);
    }
  });

  it('浮動小数点誤差でステータスが1点欠けない（冒険レベル26・素質B）', () => {
    const gradeB: Aptitude = { ...flat, maxHp: 'B' };
    const stats = computeStats(character({ adventureLevel: 26, aptitude: gradeB, currentJob: 'blank', jobs: { blank: { level: 1, exp: 0 } } }), noBonus);
    expect(stats.maxHp).toBe(925);
  });
});
