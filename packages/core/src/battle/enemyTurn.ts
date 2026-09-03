import { findCombatant } from './state.js';
import type { BattleState } from './state.js';
import type { Skill } from './skill.js';
import type { BattleEvent } from './log.js';

/**
 * その敵がこのターンに使う技を返す。
 * 行動表はターン数で循環するだけなので、プレイヤーは何ターン目に何が来るか読める。
 * 激昂したあとは、激昂したターンを1マス目として激昂用の行動表を読む。
 * 通算ターン数で数えたままだと表の途中から始まってしまい、公開した表が嘘になる。
 */
export function nextEnemyAction(state: BattleState): Skill | null {
  const table =
    state.enraged && state.enemyDef.enrage ? state.enemyDef.enrage.pattern : state.enemyDef.pattern;
  if (table.length === 0) return null;

  const firstTurn = state.enraged && state.enragedTurn !== null ? state.enragedTurn : 1;
  const entry = table[(state.turn - firstTurn) % table.length];
  return state.enemyDef.skills.find((skill) => skill.id === entry.skillId) ?? null;
}

/** HP がしきい値以下になっていたら激昂させる。すでに激昂済みなら何もしない。 */
export function checkEnrage(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  const config = state.enemyDef.enrage;
  if (!config || state.enraged) return { state, events: [] };

  const foe = findCombatant(state, state.enemyDef.id);
  if (foe.hp > foe.base.maxHp * config.hpRate) return { state, events: [] };

  return {
    state: { ...state, enraged: true, enragedTurn: state.turn },
    events: [{ t: 'enrage', actorId: foe.id }],
  };
}
