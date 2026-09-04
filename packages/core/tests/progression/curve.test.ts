import { describe, it, expect } from 'vitest';
import {
  adventureExpToNext,
  jobExpToNext,
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
} from '../../src/progression/curve.js';

describe('adventureExpToNext', () => {
  it('レベル1から2へは60', () => {
    expect(adventureExpToNext(1)).toBe(60);
  });

  it('レベルが上がるほど必要量が増える', () => {
    expect(adventureExpToNext(10)).toBeGreaterThan(adventureExpToNext(9));
  });

  it('二乗で増える', () => {
    expect(adventureExpToNext(10)).toBe(6000);
  });

  it('必ず整数を返す', () => {
    for (let level = 1; level <= MAX_ADVENTURE_LEVEL; level++) {
      expect(Number.isInteger(adventureExpToNext(level))).toBe(true);
    }
  });
});

describe('jobExpToNext', () => {
  it('冒険レベルより早く上がる', () => {
    expect(jobExpToNext(10)).toBeLessThan(adventureExpToNext(10));
  });

  it('レベル1から2へは30', () => {
    expect(jobExpToNext(1)).toBe(30);
  });

  it('必ず整数を返す', () => {
    for (let level = 1; level <= MAX_JOB_LEVEL; level++) {
      expect(Number.isInteger(jobExpToNext(level))).toBe(true);
    }
  });
});

describe('上限', () => {
  it('上級職の解禁条件（ジョブLv20）に届く上限である', () => {
    expect(MAX_JOB_LEVEL).toBeGreaterThanOrEqual(20);
  });

  it('冒険レベルの上限はジョブレベルより高い', () => {
    expect(MAX_ADVENTURE_LEVEL).toBeGreaterThan(MAX_JOB_LEVEL);
  });
});
