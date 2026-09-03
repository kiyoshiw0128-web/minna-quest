import { effectiveStat } from './effects.js';
import type { Combatant } from './state.js';

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

/**
 * 行動順を決める。実効速度の降順、同速なら ID 昇順。
 * 乱数を使わないので、プレイヤーは行動順を完全に読める。
 */
export function turnOrder(combatants: Combatant[]): Combatant[] {
  return combatants
    .filter(isAlive)
    .map((combatant) => ({
      combatant,
      speed: effectiveStat(combatant.base, 'spd', combatant.effects),
    }))
    .sort((a, b) => (a.speed !== b.speed ? b.speed - a.speed : compareId(a.combatant, b.combatant)))
    .map((entry) => entry.combatant);
}

function compareId(a: Combatant, b: Combatant): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
