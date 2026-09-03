export { simulate, DEFAULT_MAX_TURNS } from './battle/simulate.js';
export type { BattlePlan, SimulateOptions } from './battle/simulate.js';

export { computeDamage } from './battle/damage.js';
export { createBattleState, findCombatant, updateCombatant } from './battle/state.js';
export { turnOrder, isAlive } from './battle/order.js';
export { canUse, performAction } from './battle/action.js';
export { nextEnemyAction, checkEnrage } from './battle/enemyTurn.js';
export {
  effectiveStat,
  damageTakenRate,
  isStunned,
  applyEffect,
  tickEffects,
} from './battle/effects.js';

export type { StatBlock, Element, DamageSpec, DamageInput } from './battle/types.js';
export type { StatKey, Effect, ActiveEffect } from './battle/effects.js';
export type { Skill, SkillTarget } from './battle/skill.js';
export type { Enemy, EnemyPatternEntry } from './battle/enemy.js';
export type { Side, Combatant, PartyMember, BattleState } from './battle/state.js';
export type { BattleResult, SkipReason, BattleEvent, BattleLog } from './battle/log.js';
