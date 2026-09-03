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

export { SKILLS } from './data/skills.js';
export { ENEMIES, BALGOS } from './data/enemies.js';

export { aptitudeMultiplier } from './progression/aptitude.js';
export {
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
  adventureExpToNext,
  jobExpToNext,
} from './progression/curve.js';
export { learnsAt } from './progression/job.js';
export { computeStats, BASE_STATS, GROWTH_PER_LEVEL } from './progression/stats.js';
export { gainExp, applyLearns } from './progression/exp.js';
export {
  isUnlocked,
  unlockedJobs,
  canChangeJob,
  changeJob,
  createCharacter,
} from './progression/unlock.js';
export { equipActive, equipPassive, ACTIVE_SLOTS, PASSIVE_SLOTS } from './progression/equip.js';
export { toPartyMember } from './progression/bridge.js';

export type {
  Grade,
  Aptitude,
  JobId,
  JobProgress,
  Character,
  Passive,
  ProgressEvent,
} from './progression/types.js';
export type { Job, JobRequirement, JobStatBonus, LearnEntry } from './progression/job.js';
export type { ExpGain, JobTable } from './progression/exp.js';
export type { JobChangeError } from './progression/unlock.js';
export type { EquipError } from './progression/equip.js';
export type { SkillTable, PassiveTable } from './progression/bridge.js';

export { JOBS } from './data/jobs.js';
export { PASSIVES } from './data/passives.js';
