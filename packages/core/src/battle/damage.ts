import type { DamageInput, StatKey } from './types.js';

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
      return finalize(
        reduce(input.attacker[scaleOf(spec)], spec.power, input.def, spec.pierce ?? 0) * rate,
      );
    case 'magical':
      return finalize(
        reduce(input.attacker[scaleOf(spec)], spec.power, input.mdf, spec.pierce ?? 0) * rate,
      );
    case 'fixed':
      return finalize(spec.amount * rate);
    case 'ratio': {
      const raw = (input.targetMaxHp * spec.percent) / 100;
      return Math.max(1, Math.min(Math.floor(raw * rate), spec.cap));
    }
  }
}

/**
 * その技の威力を決める能力。
 *
 * 指定が無ければ物理は ATK、魔法は MAT。既定をこの2つに置くのは、大半の技が
 * それで足り、指定を書くのは「その職業らしさ」を出したいときだけにしたいため。
 * 盗賊の技を SPD で、パラディンの技を DEF で伸ばす指定をすると、職業ごとの
 * ステータス補正がそのまま攻撃面の個性になる。
 *
 * 防御側にどちらを使うかは kind が決める。SPD で伸びる物理技は、防御力で
 * 軽減される物理技のままである。scale は攻撃側だけを差し替える。
 */
function scaleOf(spec: { kind: 'physical' | 'magical'; scale?: StatKey }): StatKey {
  return spec.scale ?? (spec.kind === 'physical' ? 'atk' : 'mat');
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
