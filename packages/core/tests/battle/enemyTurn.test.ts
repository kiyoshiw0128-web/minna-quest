import { describe, it, expect } from 'vitest';
import { nextEnemyAction, checkEnrage } from '../../src/battle/enemyTurn.js';
import { createBattleState } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const breath: Skill = {
  id: 'breath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies', damage: { kind: 'magical', power: 180 },
};
const roar: Skill = {
  id: 'roar', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};
const rampage: Skill = {
  id: 'rampage', name: '狂乱', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies', damage: { kind: 'physical', power: 200 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [] };

const dragon: Enemy = {
  id: 'dragon', name: '竜',
  stats: { ...stats, maxHp: 1000 },
  skills: [breath, roar, rampage],
  pattern: [{ skillId: 'breath' }, { skillId: 'roar' }],
  enrage: { hpRate: 0.5, pattern: [{ skillId: 'rampage' }] },
};

describe('nextEnemyAction', () => {
  it('ターン数に応じて行動表を上から順に使う', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 1 })?.id).toBe('breath');
    expect(nextEnemyAction({ ...state, turn: 2 })?.id).toBe('roar');
  });

  it('行動表を使い切ったら先頭に戻る', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 3 })?.id).toBe('breath');
    expect(nextEnemyAction({ ...state, turn: 4 })?.id).toBe('roar');
  });

  it('激昂したら別の行動表に切り替わる', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 1, enraged: true })?.id).toBe('rampage');
  });

  it('行動表が空なら何もしない', () => {
    const state = createBattleState([hero], { ...dragon, pattern: [] });
    expect(nextEnemyAction(state)).toBeNull();
  });
});

describe('checkEnrage', () => {
  it('HP がしきい値を上回っていれば何も起きない', () => {
    const state = createBattleState([hero], dragon);
    const result = checkEnrage(state);
    expect(result.state.enraged).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('HP がしきい値以下になったら激昂する', () => {
    const base = createBattleState([hero], dragon);
    const hurt = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 500 } : c)),
    };
    const result = checkEnrage(hurt);
    expect(result.state.enraged).toBe(true);
    expect(result.events).toEqual([{ t: 'enrage', actorId: 'dragon' }]);
  });

  it('二度は激昂しない', () => {
    const base = createBattleState([hero], dragon);
    const already = {
      ...base,
      enraged: true,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 100 } : c)),
    };
    expect(checkEnrage(already).events).toHaveLength(0);
  });

  it('激昂を持たない敵では何も起きない', () => {
    const plain: Enemy = { id: 'dragon', name: '竜', stats: dragon.stats, skills: [breath], pattern: [{ skillId: 'breath' }] };
    const base = createBattleState([hero], plain);
    const hurt = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 1 } : c)),
    };
    expect(checkEnrage(hurt).state.enraged).toBe(false);
  });
});
