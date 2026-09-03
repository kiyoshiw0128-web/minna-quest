import type { StatBlock } from './types.js';
import type { ActiveEffect, Effect } from './effects.js';
import type { Skill } from './skill.js';
import type { Enemy } from './enemy.js';

export type Side = 'ally' | 'enemy';

/** 戦闘中の1体。味方も敵も同じ形で扱う。 */
export type Combatant = {
  id: string;
  name: string;
  side: Side;
  base: StatBlock;
  hp: number;
  mp: number;
  skills: readonly Skill[];
  effects: ActiveEffect[];
  /** 技ID -> あと何ターン使えないか */
  cooldowns: Record<string, number>;
};

/** 戦闘に連れて行くキャラ。装備した6枠の技とパッシブを持つ。 */
export type PartyMember = {
  id: string;
  name: string;
  stats: StatBlock;
  skills: readonly Skill[];
  /** パッシブ枠とペットの効果。戦闘開始時から永続でかかる */
  passives?: readonly Effect[];
};

export type BattleState = {
  turn: number;
  combatants: Combatant[];
  enemyDef: Enemy;
  enraged: boolean;
};

export function createBattleState(party: PartyMember[], enemy: Enemy): BattleState {
  const allies: Combatant[] = party.map((member) => ({
    id: member.id,
    name: member.name,
    side: 'ally',
    base: member.stats,
    hp: member.stats.maxHp,
    mp: member.stats.maxMp,
    skills: member.skills,
    effects: (member.passives ?? []).map((effect) => ({ effect, remaining: Infinity, appliedTurn: 0 })),
    cooldowns: {},
  }));

  const foe: Combatant = {
    id: enemy.id,
    name: enemy.name,
    side: 'enemy',
    base: enemy.stats,
    hp: enemy.stats.maxHp,
    mp: enemy.stats.maxMp,
    skills: enemy.skills,
    effects: [],
    cooldowns: {},
  };

  return { turn: 1, combatants: [...allies, foe], enemyDef: enemy, enraged: false };
}

export function findCombatant(state: BattleState, id: string): Combatant {
  const found = state.combatants.find((combatant) => combatant.id === id);
  if (!found) throw new Error(`unknown combatant: ${id}`);
  return found;
}

export function updateCombatant(
  state: BattleState,
  id: string,
  updater: (combatant: Combatant) => Combatant,
): BattleState {
  return {
    ...state,
    combatants: state.combatants.map((combatant) =>
      combatant.id === id ? updater(combatant) : combatant,
    ),
  };
}
