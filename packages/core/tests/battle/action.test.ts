import { describe, it, expect } from 'vitest';
import { performAction, canUse } from '../../src/battle/action.js';
import { createBattleState, findCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
};

const fireball: Skill = {
  id: 'fireball', name: '火球', mpCost: 12, cooldown: 2,
  element: 'fire', target: 'enemy',
  damage: { kind: 'magical', power: 150 },
};

const heal: Skill = {
  id: 'heal', name: '癒やしの光', mpCost: 8, cooldown: 0,
  element: 'holy', target: 'lowestHpAlly',
  heal: 120,
};

const roar: Skill = {
  id: 'roar', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};

const charge: Skill = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
};

const hero: PartyMember = {
  id: 'hero', name: '主人公', stats, skills: [slash, fireball, heal, roar, charge],
};
const mage: PartyMember = { id: 'mage', name: '魔法使い', stats, skills: [fireball, heal] };

const dummy: Enemy = {
  id: 'dummy', name: '木人',
  stats: { ...stats, maxHp: 2000, def: 60, mdf: 40, spd: 5 },
  skills: [slash, roar, charge],
  resist: { fire: 1.5 },
  pattern: [{ skillId: 'slash' }],
};

describe('performAction - ダメージ', () => {
  it('物理攻撃で敵の HP を削る', () => {
    const state = createBattleState([hero], dummy);
    const { state: after, events } = performAction(state, 'hero', slash);
    // ATK120 威力100 vs DEF60 -> 75
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 75);
    expect(events).toContainEqual({ t: 'damage', targetId: 'dummy', amount: 75, hpAfter: 1925 });
  });

  it('敵の属性弱点を反映する', () => {
    const state = createBattleState([mage], dummy);
    const { state: after } = performAction(state, 'mage', fireball);
    // MAT100 威力150 = 150 -> 150 * 100/140 = 107.1 -> * 1.5 = 160.7 -> 160
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 160);
  });

  it('MP を消費してクールダウンを立てる', () => {
    const state = createBattleState([mage], dummy);
    const { state: after } = performAction(state, 'mage', fireball);
    const actor = findCombatant(after, 'mage');
    expect(actor.mp).toBe(80 - 12);
    expect(actor.cooldowns['fireball']).toBe(2);
  });

  it('倒したら down を記録する', () => {
    const weak: Enemy = { ...dummy, stats: { ...dummy.stats, maxHp: 10 } };
    const state = createBattleState([hero], weak);
    const { state: after, events } = performAction(state, 'hero', slash);
    expect(findCombatant(after, 'dummy').hp).toBe(0);
    expect(events).toContainEqual({ t: 'down', actorId: 'dummy' });
  });
});

describe('performAction - 回復と効果', () => {
  it('最も HP割合の低い味方を回復する', () => {
    const base = createBattleState([hero, mage], dummy);
    const wounded = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'mage' ? { ...c, hp: 100 } : c)),
    };
    const { state: after } = performAction(wounded, 'hero', heal);
    // MAT100 の 120% = 120 回復
    expect(findCombatant(after, 'mage').hp).toBe(220);
    expect(findCombatant(after, 'hero').hp).toBe(500);
  });

  it('回復は最大 HP を超えない', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', heal);
    expect(findCombatant(after, 'hero').hp).toBe(500);
  });

  it('相手全体にデバフをかける', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', roar);
    expect(findCombatant(after, 'dummy').effects).toHaveLength(1);
    expect(findCombatant(after, 'hero').effects).toHaveLength(0);
  });

  it('自分に効果をかける（溜め）', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', charge);
    expect(findCombatant(after, 'hero').effects).toHaveLength(1);
  });

  it('溜め中の相手には増えたダメージが入る', () => {
    const state = createBattleState([hero, mage], dummy);
    const charged = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'dummy'
          ? { ...c, effects: [{ effect: { kind: 'damageTaken' as const, rate: 0.5, turns: 1 }, remaining: 1 }] }
          : c,
      ),
    };
    const { state: after } = performAction(charged, 'hero', slash);
    // 75 * 1.5 = 112.5 -> 112
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 112);
  });

  it('元の状態を書き換えない', () => {
    const state = createBattleState([hero], dummy);
    performAction(state, 'hero', slash);
    expect(findCombatant(state, 'dummy').hp).toBe(2000);
  });
});

describe('canUse', () => {
  it('MP が足りていてクールダウンも無ければ ok', () => {
    const state = createBattleState([mage], dummy);
    expect(canUse(findCombatant(state, 'mage'), fireball)).toBe('ok');
  });

  it('MP が足りなければ noMp', () => {
    const state = createBattleState([mage], dummy);
    const drained = { ...findCombatant(state, 'mage'), mp: 0 };
    expect(canUse(drained, fireball)).toBe('noMp');
  });

  it('クールダウン中なら cooldown', () => {
    const state = createBattleState([mage], dummy);
    const cooling = { ...findCombatant(state, 'mage'), cooldowns: { fireball: 1 } };
    expect(canUse(cooling, fireball)).toBe('cooldown');
  });
});
