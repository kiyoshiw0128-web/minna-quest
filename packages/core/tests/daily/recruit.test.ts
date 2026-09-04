import { describe, it, expect } from 'vitest';
import {
  aptitudeQuality,
  recruitCost,
  rollRecruits,
  RECRUITS_PER_DAY,
} from '../../src/daily/recruit.js';
import type { Aptitude } from '../../src/progression/types.js';

const allC: Aptitude = { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' };
const allA: Aptitude = { maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A' };
const allE: Aptitude = { maxHp: 'E', maxMp: 'E', atk: 'E', def: 'E', mat: 'E', mdf: 'E', spd: 'E' };

const names = ['アルド', 'ベラ', 'カイ', 'ディナ', 'エリク', 'フィナ'];
const jobIds = ['warrior', 'mage', 'priest'];

describe('aptitudeQuality', () => {
  it('全項目Aで28', () => {
    expect(aptitudeQuality(allA)).toBe(28);
  });

  it('全項目Eで0', () => {
    expect(aptitudeQuality(allE)).toBe(0);
  });

  it('全項目Cで14', () => {
    expect(aptitudeQuality(allC)).toBe(14);
  });
});

describe('recruitCost', () => {
  it('冒険レベルに比例する', () => {
    expect(recruitCost(10, allC)).toBe(recruitCost(5, allC) * 2);
  });

  it('素質が高いほど高い', () => {
    expect(recruitCost(10, allA)).toBeGreaterThan(recruitCost(10, allC));
    expect(recruitCost(10, allC)).toBeGreaterThan(recruitCost(10, allE));
  });

  it('素質では最大2倍までしか上がらない', () => {
    expect(recruitCost(10, allA)).toBe(recruitCost(10, allE) * 2);
  });

  it('素質の高い低レベル人材のほうが、素質の低い高レベル人材より安い', () => {
    expect(recruitCost(3, allA)).toBeLessThan(recruitCost(15, allC));
  });

  it('整数を返す', () => {
    for (let level = 1; level <= 20; level++) {
      expect(Number.isInteger(recruitCost(level, allC))).toBe(true);
    }
  });
});

describe('rollRecruits', () => {
  it('3人並ぶ', () => {
    expect(rollRecruits(1, 'w:1', names, jobIds, 15)).toHaveLength(RECRUITS_PER_DAY);
  });

  it('同じシードなら全員が同じ顔ぶれを見る', () => {
    expect(rollRecruits(7, 'w:7', names, jobIds, 15)).toEqual(rollRecruits(7, 'w:7', names, jobIds, 15));
  });

  it('日が変われば顔ぶれも変わる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      seen.add(rollRecruits(seed, `w:${seed}`, names, jobIds, 15).map((r) => r.name).join());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('同じ名前が2人並ばない', () => {
    for (let seed = 0; seed < 30; seed++) {
      const roster = rollRecruits(seed, `w:${seed}`, names, jobIds, 15);
      expect(new Set(roster.map((r) => r.name)).size).toBe(roster.length);
    }
  });

  it('職業は渡した一覧の中から選ばれる', () => {
    for (const recruit of rollRecruits(3, 'w:3', names, jobIds, 15)) {
      expect(jobIds).toContain(recruit.jobId);
    }
  });

  it('冒険レベルは1以上 maxLevel 以下', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const recruit of rollRecruits(seed, `w:${seed}`, names, jobIds, 15)) {
        expect(recruit.adventureLevel).toBeGreaterThanOrEqual(1);
        expect(recruit.adventureLevel).toBeLessThanOrEqual(15);
      }
    }
  });

  it('素質は7項目すべてが埋まっている', () => {
    for (const recruit of rollRecruits(3, 'w:3', names, jobIds, 15)) {
      for (const key of ['maxHp', 'maxMp', 'atk', 'def', 'mat', 'mdf', 'spd'] as const) {
        expect(['A', 'B', 'C', 'D', 'E']).toContain(recruit.aptitude[key]);
      }
    }
  });

  it('値段は本人のレベルと素質から決まる', () => {
    for (const recruit of rollRecruits(3, 'w:3', names, jobIds, 15)) {
      expect(recruit.cost).toBe(recruitCost(recruit.adventureLevel, recruit.aptitude));
    }
  });

  it('IDは3人とも別々', () => {
    const roster = rollRecruits(3, 'w:3', names, jobIds, 15);
    expect(new Set(roster.map((r) => r.id)).size).toBe(roster.length);
  });

  it('顔ぶれは横並びに多様（30日分で職業が2種類以上出る）', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const recruit of rollRecruits(seed, `w:${seed}`, names, jobIds, 15)) seen.add(recruit.jobId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('元の配列を変更しない', () => {
    const inputNames = [...names];
    rollRecruits(1, 'w:1', inputNames, jobIds, 15);
    expect(inputNames).toEqual(names);
  });

  it('シードが同じでも idPrefix が違えばIDは衝突しない', () => {
    const a = rollRecruits(1, 'world-a:5', names, jobIds, 15);
    const b = rollRecruits(1, 'world-b:9', names, jobIds, 15);

    // シードが同じなので中身は同一。IDだけが世界と日で分かれる。
    expect(a.map((r) => r.name)).toEqual(b.map((r) => r.name));
    expect(a.map((r) => r.id)).toEqual(['world-a:5-0', 'world-a:5-1', 'world-a:5-2']);
    expect(a.map((r) => r.id).some((id) => b.some((r) => r.id === id))).toBe(false);
  });
});

describe('rollRecruits - 異常系', () => {
  it('maxLevel が1未満なら rollRecruits の名前で投げる', () => {
    expect(() => rollRecruits(1, 'w:1', names, jobIds, 0)).toThrow('rollRecruits: maxLevel');
  });

  it('名前が並べる人数に足りなければ rollRecruits の名前で投げる', () => {
    expect(() => rollRecruits(1, 'w:1', ['アルド', 'ベラ'], jobIds, 15)).toThrow(
      'rollRecruits: names',
    );
  });
});
