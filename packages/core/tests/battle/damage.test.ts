import { describe, it, expect } from 'vitest';
import { computeDamage } from '../../src/battle/damage.js';
import type { DamageInput } from '../../src/battle/types.js';

const base: Omit<DamageInput, 'spec'> = {
  atk: 120,
  mat: 100,
  def: 60,
  mdf: 40,
  targetMaxHp: 1000,
  elementRate: 1,
  damageTakenRate: 1,
};

describe('computeDamage - 物理', () => {
  it('除算式で DEF によって軽減される', () => {
    // 120 * 100/100 = 120 の基礎値が、DEF60 で 120 * 100/160 = 75 になる
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 100 } })).toBe(75);
  });

  it('貫通率のぶんだけ DEF を無視する', () => {
    // DEF60 の半分を無視 -> 120 * 100/130 = 92.3 -> 92
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 100, pierce: 0.5 } })).toBe(92);
  });

  it('技威力に比例する', () => {
    // 基礎 240 -> 240 * 100/160 = 150
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 200 } })).toBe(150);
  });

  it('どれだけ硬くても最低1ダメージは通る', () => {
    expect(
      computeDamage({ ...base, atk: 1, def: 9999, spec: { kind: 'physical', power: 1 } }),
    ).toBe(1);
  });
});

describe('computeDamage - 魔法・固定・割合', () => {
  it('魔法は MAT と MDF で計算する', () => {
    // 100 * 100/100 = 100 -> 100 * 100/140 = 71.4 -> 71
    expect(computeDamage({ ...base, spec: { kind: 'magical', power: 100 } })).toBe(71);
  });

  it('固定ダメージは防御を一切見ない', () => {
    expect(computeDamage({ ...base, def: 9999, spec: { kind: 'fixed', amount: 250 } })).toBe(250);
  });

  it('割合ダメージは最大HPに比例し、上限で頭打ちになる', () => {
    // 1000 の 10% = 100 だが、上限 80 で止まる
    expect(computeDamage({ ...base, spec: { kind: 'ratio', percent: 10, cap: 80 } })).toBe(80);
  });

  it('割合ダメージは上限に達しなければそのまま通る', () => {
    expect(computeDamage({ ...base, spec: { kind: 'ratio', percent: 10, cap: 500 } })).toBe(100);
  });
});

describe('computeDamage - 倍率', () => {
  it('属性倍率を掛ける', () => {
    // 75 * 1.5 = 112.5 -> 112
    expect(
      computeDamage({ ...base, elementRate: 1.5, spec: { kind: 'physical', power: 100 } }),
    ).toBe(112);
  });

  it('被ダメージ倍率を掛ける（溜め中の敵を殴る想定）', () => {
    // 75 * 1.5 = 112.5 -> 112
    expect(
      computeDamage({ ...base, damageTakenRate: 1.5, spec: { kind: 'physical', power: 100 } }),
    ).toBe(112);
  });

  it('属性倍率と被ダメージ倍率は乗算で重なる', () => {
    // 75 * 1.5 * 1.5 = 168.75 -> 168
    expect(
      computeDamage({
        ...base,
        elementRate: 1.5,
        damageTakenRate: 1.5,
        spec: { kind: 'physical', power: 100 },
      }),
    ).toBe(168);
  });

  it('固定ダメージにも倍率は乗る', () => {
    expect(
      computeDamage({ ...base, damageTakenRate: 1.5, spec: { kind: 'fixed', amount: 200 } }),
    ).toBe(300);
  });
});
