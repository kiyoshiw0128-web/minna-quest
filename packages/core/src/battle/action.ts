import { computeDamage } from './damage.js';
import { applyEffect, damageTakenRate, effectiveStat } from './effects.js';
import { isAlive } from './order.js';
import { findCombatant, updateCombatant } from './state.js';
import type { BattleState, Combatant } from './state.js';
import type { Skill } from './skill.js';
import type { AttackerStats, Element } from './types.js';
import type { BattleEvent } from './log.js';

export type ActionResult = { state: BattleState; events: BattleEvent[] };

export function canUse(actor: Combatant, skill: Skill): 'ok' | 'noMp' | 'cooldown' {
  if ((actor.cooldowns[skill.id] ?? 0) > 0) return 'cooldown';
  if (actor.mp < skill.mpCost) return 'noMp';
  return 'ok';
}

/**
 * 技を1回使う。MP とクールダウンは呼び出し側で canUse により確認済みとする。
 * 状態は書き換えず、新しい state を返す。
 */
export function performAction(state: BattleState, actorId: string, skill: Skill): ActionResult {
  const actor = findCombatant(state, actorId);
  const events: BattleEvent[] = [{ t: 'act', actorId, skillId: skill.id }];

  let next = updateCombatant(state, actorId, (combatant) => ({
    ...combatant,
    mp: combatant.mp - skill.mpCost,
    cooldowns: { ...combatant.cooldowns, [skill.id]: skill.cooldown },
  }));

  // 攻撃側の実効値は行動の開始時に一度だけ確定させる。技が複数の対象を打つとき、
  // 1体目に与えた弱体で2体目への威力が変わってしまうのを避けるため。
  const attacker = effectiveAttackerStats(actor);

  for (const target of resolveTargets(next, actor, skill)) {
    if (skill.damage) {
      const current = findCombatant(next, target.id);
      const amount = computeDamage({
        attacker,
        def: effectiveStat(current.base, 'def', current.effects),
        mdf: effectiveStat(current.base, 'mdf', current.effects),
        targetMaxHp: current.base.maxHp,
        spec: skill.damage,
        elementRate: elementRateFor(next, current, skill.element),
        damageTakenRate: damageTakenRate(current.effects),
      });
      const hpAfter = Math.max(0, current.hp - amount);
      next = updateCombatant(next, current.id, (combatant) => ({ ...combatant, hp: hpAfter }));
      events.push({ t: 'damage', targetId: current.id, amount, hpAfter });
      if (hpAfter === 0) events.push({ t: 'down', actorId: current.id });
    }

    if (skill.heal !== undefined) {
      const current = findCombatant(next, target.id);
      const raw = Math.max(1, Math.floor((attacker[skill.healScale ?? 'mat'] * skill.heal) / 100));
      const hpAfter = Math.min(current.base.maxHp, current.hp + raw);
      next = updateCombatant(next, current.id, (combatant) => ({ ...combatant, hp: hpAfter }));
      events.push({ t: 'heal', targetId: current.id, amount: hpAfter - current.hp, hpAfter });
    }

    for (const entry of skill.effects ?? []) {
      if (entry.to !== 'target') continue;
      next = updateCombatant(next, target.id, (combatant) => ({
        ...combatant,
        effects: applyEffect(combatant.effects, entry.effect, state.turn),
      }));
      events.push({ t: 'effect', targetId: target.id, effect: entry.effect });
    }
  }

  for (const entry of skill.effects ?? []) {
    if (entry.to !== 'self') continue;
    next = updateCombatant(next, actorId, (combatant) => ({
      ...combatant,
      effects: applyEffect(combatant.effects, entry.effect, state.turn),
    }));
    events.push({ t: 'effect', targetId: actorId, effect: entry.effect });
  }

  return { state: next, events };
}

function effectiveAttackerStats(actor: Combatant): AttackerStats {
  return {
    atk: effectiveStat(actor.base, 'atk', actor.effects),
    def: effectiveStat(actor.base, 'def', actor.effects),
    mat: effectiveStat(actor.base, 'mat', actor.effects),
    mdf: effectiveStat(actor.base, 'mdf', actor.effects),
    spd: effectiveStat(actor.base, 'spd', actor.effects),
  };
}

function resolveTargets(state: BattleState, actor: Combatant, skill: Skill): Combatant[] {
  const alive = state.combatants.filter(isAlive);
  const foes = alive.filter((combatant) => combatant.side !== actor.side);
  const mates = alive.filter((combatant) => combatant.side === actor.side);

  switch (skill.target) {
    case 'enemy':
      return pickLowestHp(foes);
    case 'allEnemies':
      return foes;
    case 'lowestHpAlly':
      return pickLowestHp(mates);
    case 'allAllies':
      return mates;
    case 'self':
      return [actor];
  }
}

/** HP割合が最も低い1体。同率なら ID 昇順。誰もいなければ空。 */
function pickLowestHp(candidates: Combatant[]): Combatant[] {
  if (candidates.length === 0) return [];
  const best = candidates.reduce((lowest, candidate) => {
    const a = hpRate(candidate);
    const b = hpRate(lowest);
    if (a < b) return candidate;
    if (a > b) return lowest;
    return candidate.id < lowest.id ? candidate : lowest;
  });
  return [best];
}

function hpRate(combatant: Combatant): number {
  return combatant.hp / combatant.base.maxHp;
}

function elementRateFor(state: BattleState, target: Combatant, element: Element): number {
  if (target.side !== 'enemy') return 1;
  return state.enemyDef.resist?.[element] ?? 1;
}
