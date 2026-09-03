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
