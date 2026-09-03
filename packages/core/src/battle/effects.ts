import type { StatBlock } from './types.js';

export type StatKey = 'atk' | 'def' | 'mat' | 'mdf' | 'spd';

/** 一時的な効果。turns は付与された時点での持続ターン数。 */
export type Effect =
  | { kind: 'statMod'; stat: StatKey; rate: number; turns: number }
  | { kind: 'damageTaken'; rate: number; turns: number }
  | { kind: 'stun'; turns: number };

/** 戦闘中に実際にかかっている効果。remaining は残りターン数。 */
export type ActiveEffect = { effect: Effect; remaining: number };

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

export function applyEffect(actives: ActiveEffect[], effect: Effect): ActiveEffect[] {
  return [...actives, { effect, remaining: effect.turns }];
}

export function tickEffects(actives: ActiveEffect[]): {
  remaining: ActiveEffect[];
  expired: ActiveEffect[];
} {
  const decremented = actives.map((active) =>
    active.remaining === Infinity ? active : { ...active, remaining: active.remaining - 1 },
  );
  return {
    remaining: decremented.filter((active) => active.remaining > 0),
    expired: decremented.filter((active) => active.remaining <= 0),
  };
}
