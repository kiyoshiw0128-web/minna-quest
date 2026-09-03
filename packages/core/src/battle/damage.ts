import type { DamageInput } from './types.js';

/**
 * ダメージを計算する。乱数は使わない。
 * 除算式を採るのは、減算式だと DEF が少し上がっただけでダメージが 0 に落ちて
 * 詰みが生まれるため。
 */
export function computeDamage(input: DamageInput): number {
  const { spec, elementRate, damageTakenRate } = input;
  const rate = elementRate * damageTakenRate;

  switch (spec.kind) {
    case 'physical':
      return finalize(reduce(input.atk, spec.power, input.def, spec.pierce ?? 0) * rate);
    case 'magical':
      return finalize(reduce(input.mat, spec.power, input.mdf, spec.pierce ?? 0) * rate);
    case 'fixed':
      return finalize(spec.amount * rate);
    case 'ratio': {
      const raw = (input.targetMaxHp * spec.percent) / 100;
      return Math.max(1, Math.min(Math.floor(raw * rate), spec.cap));
    }
  }
}

function reduce(attack: number, power: number, defense: number, pierce: number): number {
  const effectiveDefense = defense * (1 - clamp01(pierce));
  const basePower = (attack * power) / 100;
  return (basePower * 100) / (100 + effectiveDefense);
}

function finalize(value: number): number {
  return Math.max(1, Math.floor(value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
