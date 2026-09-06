import { describe, it, expect } from 'vitest';
import { WEAPONS, ARMORS, EQUIPMENT, applyEquipment } from '../../src/data/equipment.js';
import { BASE_STATS } from '../../src/progression/stats.js';
import type { StatBlock } from '../../src/battle/types.js';

/**
 * `as const satisfies` で定義しているため、各アイテムの mods は
 * アイテムごとに異なるリテラル型のユニオンになる。テストでは
 * 「そのキーを持たない品目もある」を前提に緩く読みたいので、
 * Partial<Record<...>> に戻してから読む。
 */
function modOf(mods: object, key: keyof StatBlock): number {
  return (mods as Partial<Record<keyof StatBlock, number>>)[key] ?? 0;
}

describe('装備マスタの健全性（設計書 §5）', () => {
  it('キーと id が一致している', () => {
    for (const [key, item] of Object.entries(EQUIPMENT)) {
      expect(item.id).toBe(key);
    }
  });

  it('武器10・防具10前後', () => {
    expect(Object.keys(WEAPONS).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(WEAPONS).length).toBeLessThanOrEqual(12);
    expect(Object.keys(ARMORS).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(ARMORS).length).toBeLessThanOrEqual(12);
  });

  it('武器のslotはweapon、防具のslotはarmor', () => {
    for (const weapon of Object.values(WEAPONS)) expect(weapon.slot).toBe('weapon');
    for (const armor of Object.values(ARMORS)) expect(armor.slot).toBe('armor');
  });

  it('値段は序盤100〜300・中盤400〜900・終盤1200〜2500のどれかに収まる（設計書 §5）', () => {
    for (const item of Object.values(EQUIPMENT)) {
      const inEarly = item.cost >= 100 && item.cost <= 300;
      const inMid = item.cost >= 400 && item.cost <= 900;
      const inLate = item.cost >= 1200 && item.cost <= 2500;
      expect(inEarly || inMid || inLate).toBe(true);
    }
  });

  it('武器はATK寄りとMAT寄りの両方がある（設計書 §5 — 魔法職が武器を買えないと片手落ち）', () => {
    const hasAtk = Object.values(WEAPONS).some((item) => modOf(item.mods, 'atk') > 0);
    const hasMat = Object.values(WEAPONS).some((item) => modOf(item.mods, 'mat') > 0);
    expect(hasAtk).toBe(true);
    expect(hasMat).toBe(true);
  });

  it('防具は守り（DEF/MDF/maxHP）だけを持ち、ATK・MAT・maxMPは持たない（設計書 §3）', () => {
    for (const armor of Object.values(ARMORS)) {
      expect(modOf(armor.mods, 'atk')).toBe(0);
      expect(modOf(armor.mods, 'mat')).toBe(0);
      expect(modOf(armor.mods, 'maxMp')).toBe(0);
    }
  });

  it('加算のみ。負の値を持つ装備は無い（設計書 §3 — 倍率は使わない）', () => {
    for (const item of Object.values(EQUIPMENT)) {
      for (const value of Object.values(item.mods)) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe('applyEquipment', () => {
  it('装備なし（null, null）なら値を変えずに返す（設計書 §8 テスト1の核）', () => {
    const stats = { ...BASE_STATS };
    expect(applyEquipment(stats, null, null)).toEqual(stats);
  });

  it('武器・防具それぞれのmodsを加算する', () => {
    const stats: StatBlock = { maxHp: 200, maxMp: 40, atk: 40, def: 40, mat: 40, mdf: 40, spd: 40 };
    const result = applyEquipment(stats, WEAPONS.steelBlade, ARMORS.ironMail);
    expect(result.atk).toBe(stats.atk + WEAPONS.steelBlade.mods.atk!);
    expect(result.spd).toBe(stats.spd + WEAPONS.steelBlade.mods.spd!);
    expect(result.def).toBe(stats.def + ARMORS.ironMail.mods.def!);
    expect(result.maxHp).toBe(stats.maxHp + ARMORS.ironMail.mods.maxHp!);
  });

  it('触れていないステータスは変えない', () => {
    const stats: StatBlock = { maxHp: 200, maxMp: 40, atk: 40, def: 40, mat: 40, mdf: 40, spd: 40 };
    const result = applyEquipment(stats, WEAPONS.rustedSword, null);
    expect(result.mat).toBe(stats.mat);
    expect(result.maxHp).toBe(stats.maxHp);
  });

  /**
   * 設計書 §8 テスト7・§2「上げ幅は控えめにする。装備一式で素の能力の
   * 2〜3割増しまで」。品揃えの数値を手で調整するだけでなく、
   * applyEquipment 自身が上限をクランプすることを確かめる
   * （品揃えが後から増えても機械的に守られることの検査）。
   */
  it('低レベルのキャラが終盤装備一式を着けても、素の能力の3割増しを超えない', () => {
    // 冒険レベル1・素質Cの戦士相当（BASE_STATSそのもの）に、
    // いちばん値の張る終盤武器・終盤防具を着けたケースで確かめる。
    const stats = { ...BASE_STATS };
    const result = applyEquipment(stats, WEAPONS.dragonFang, ARMORS.aegisPlate);
    for (const key of Object.keys(stats) as Array<keyof StatBlock>) {
      expect(result[key]).toBeLessThanOrEqual(Math.floor(stats[key] * 1.3));
    }
  });

  it('全アイテムの中でいちばん重いmodsの組み合わせでも3割を超えない', () => {
    const stats: StatBlock = { maxHp: 120, maxMp: 20, atk: 12, def: 10, mat: 10, mdf: 10, spd: 10 };
    for (const weapon of Object.values(WEAPONS)) {
      for (const armor of Object.values(ARMORS)) {
        const result = applyEquipment(stats, weapon, armor);
        for (const key of Object.keys(stats) as Array<keyof StatBlock>) {
          expect(result[key]).toBeLessThanOrEqual(Math.floor(stats[key] * 1.3));
        }
      }
    }
  });
});
