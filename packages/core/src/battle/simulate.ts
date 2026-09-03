import { canUse, performAction } from './action.js';
import { isStunned, tickEffects } from './effects.js';
import { checkEnrage, nextEnemyAction } from './enemyTurn.js';
import { isAlive, turnOrder } from './order.js';
import { createBattleState, findCombatant, updateCombatant } from './state.js';
import type { BattleState, Combatant, PartyMember } from './state.js';
import type { Enemy } from './enemy.js';
import type { Skill } from './skill.js';
import type { BattleEvent, BattleLog, BattleResult } from './log.js';

export const DEFAULT_MAX_TURNS = 8;

/** キャラID -> ターンごとの技ID。null は「何もしない」。 */
export type BattlePlan = Record<string, (string | null)[]>;

export type SimulateOptions = { maxTurns?: number };

/**
 * 戦闘をまるごと解決する。乱数を使わないので、同じ入力からは必ず同じログが出る。
 * サーバがこの関数の結果を正とし、フロントは返ってきたログを再生するだけでよい。
 */
export function simulate(
  party: PartyMember[],
  enemy: Enemy,
  plan: BattlePlan,
  options: SimulateOptions = {},
): BattleLog {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  let state = createBattleState(party, enemy);
  const events: BattleEvent[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    state = { ...state, turn };
    events.push({ t: 'turnStart', turn });

    for (const scheduled of turnOrder(state.combatants)) {
      const actor = findCombatant(state, scheduled.id);
      if (!isAlive(actor)) continue;

      if (isStunned(actor.effects)) {
        events.push({ t: 'skip', actorId: actor.id, reason: 'stunned' });
        continue;
      }

      const skill =
        actor.side === 'enemy' ? nextEnemyAction(state) : skillFromPlan(actor, plan, turn);

      if (skill === 'unknownSkill') {
        events.push({ t: 'skip', actorId: actor.id, reason: 'unknownSkill' });
        continue;
      }

      if (!skill) {
        events.push({ t: 'skip', actorId: actor.id, reason: 'noAction' });
        continue;
      }

      const usable = canUse(actor, skill);
      if (usable !== 'ok') {
        events.push({ t: 'skip', actorId: actor.id, reason: usable });
        continue;
      }

      const acted = performAction(state, actor.id, skill);
      state = acted.state;
      events.push(...acted.events);

      // 敵が倒れているなら激昂は起こさない。死体の上で激昂するログを
      // フロントが再生してしまうため。
      if (isAlive(findCombatant(state, state.enemyDef.id))) {
        const enraged = checkEnrage(state);
        state = enraged.state;
        events.push(...enraged.events);
      }

      const decided = decide(state);
      if (decided) return finish(decided, turn, events);
    }

    const ticked = tickAll(state);
    state = ticked.state;
    events.push(...ticked.events);
  }

  return finish('timeout', maxTurns, events);
}

/**
 * そのターンにプランが指している技を返す。
 * null は「意図的に何もしない」、'unknownSkill' は「そのキャラが持っていない技を
 * 指している」＝改竄されたか壊れたプラン。simulate はサーバ側の正なので、
 * この2つはログ上でも区別できなければならない。
 */
function skillFromPlan(
  actor: Combatant,
  plan: BattlePlan,
  turn: number,
): Skill | 'unknownSkill' | null {
  const skillId = plan[actor.id]?.[turn - 1] ?? null;
  if (skillId === null) return null;
  return actor.skills.find((skill) => skill.id === skillId) ?? 'unknownSkill';
}

/** 敵の全滅判定を味方の全滅判定より先に見るのは、相打ちをプレイヤー有利に倒すため。 */
function decide(state: BattleState): BattleResult | null {
  if (!isAlive(findCombatant(state, state.enemyDef.id))) return 'win';
  if (!state.combatants.some((c) => c.side === 'ally' && isAlive(c))) return 'lose';
  return null;
}

/** ターン終わりに、効果の残りターンとクールダウンを1ずつ減らす。 */
function tickAll(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  let next = state;
  const events: BattleEvent[] = [];

  for (const combatant of state.combatants) {
    const { remaining, expired } = tickEffects(combatant.effects, state.turn);
    const cooldowns = Object.fromEntries(
      Object.entries(combatant.cooldowns).map(([id, turns]) => [id, Math.max(0, turns - 1)]),
    );
    next = updateCombatant(next, combatant.id, (target) => ({ ...target, effects: remaining, cooldowns }));
    for (const active of expired) {
      events.push({ t: 'expire', targetId: combatant.id, effect: active.effect });
    }
  }

  return { state: next, events };
}

function finish(result: BattleResult, turns: number, events: BattleEvent[]): BattleLog {
  return { result, turns, events: [...events, { t: 'end', result, turns }] };
}
