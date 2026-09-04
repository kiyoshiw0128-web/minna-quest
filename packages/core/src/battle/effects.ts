import type { StatBlock, StatKey } from './types.js';

export type { StatKey };

/** 一時的な効果。turns は付与された時点での持続ターン数。 */
export type Effect =
  | { kind: 'statMod'; stat: StatKey; rate: number; turns: number }
  | { kind: 'damageTaken'; rate: number; turns: number }
  | { kind: 'stun'; turns: number };

/**
 * 戦闘中に実際にかかっている効果。
 * remaining は残りターン数、appliedTurn は付与されたターン。
 */
export type ActiveEffect = { effect: Effect; remaining: number; appliedTurn: number };

/** どれだけ弱体化されても素の値の10%は残す。 */
const MIN_MULTIPLIER = 0.1;

export function effectiveStat(base: StatBlock, stat: StatKey, actives: ActiveEffect[]): number {
  const total = actives.reduce(
    (sum, active) =>
      active.effect.kind === 'statMod' && active.effect.stat === stat
        ? sum + active.effect.rate
        : sum,
    0,
  );
  const multiplier = Math.max(MIN_MULTIPLIER, 1 + total);
  return Math.max(1, Math.floor(base[stat] * multiplier));
}

export function damageTakenRate(actives: ActiveEffect[]): number {
  const total = actives.reduce(
    (sum, active) => (active.effect.kind === 'damageTaken' ? sum + active.effect.rate : sum),
    0,
  );
  return Math.max(MIN_MULTIPLIER, 1 + total);
}

export function isStunned(actives: ActiveEffect[]): boolean {
  return actives.some((active) => active.effect.kind === 'stun');
}

/**
 * 効果を付与する。turn は付与された時点のターン番号。
 * これを覚えておくのは、付与されたその同じターンの終わりに減算されないようにするため。
 * 覚えていないと、効果の寿命が「付与者がそのターンの何番目に動いたか」＝速度で
 * 変わってしまい、遅い敵の turns:1 は誰にも当たらないまま消える。
 */
export function applyEffect(
  actives: ActiveEffect[],
  effect: Effect,
  turn: number,
): ActiveEffect[] {
  return [...actives, { effect, remaining: effect.turns, appliedTurn: turn }];
}

/**
 * ターン終わりに残りターン数を1減らす。turn は今まさに終わろうとしているターン。
 * そのターンに付与された効果は減らさないので、ターン M に付与された turns:N の効果は
 * 付与直後からターン M+N の終わりまで、付与者の速度と無関係に効き続ける。
 */
export function tickEffects(
  actives: ActiveEffect[],
  turn: number,
): {
  remaining: ActiveEffect[];
  expired: ActiveEffect[];
} {
  const decremented = actives.map((active) =>
    active.remaining === Infinity || active.appliedTurn >= turn
      ? active
      : { ...active, remaining: active.remaining - 1 },
  );
  return {
    remaining: decremented.filter((active) => active.remaining > 0),
    expired: decremented.filter((active) => active.remaining <= 0),
  };
}
