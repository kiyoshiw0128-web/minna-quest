import { describe, it, expect } from 'vitest';
import { turnOrder, isAlive } from '../../src/battle/order.js';
import type { Combatant } from '../../src/battle/state.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 100, maxMp: 10, atk: 10, def: 10, mat: 10, mdf: 10, spd: 10,
};

function combatant(id: string, spd: number, hp = 100): Combatant {
  return {
    id, name: id, side: 'ally',
    base: { ...stats, spd },
    hp, mp: 10, skills: [], effects: [], cooldowns: {},
  };
}

describe('turnOrder', () => {
  it('速度の高い順に並べる', () => {
    const order = turnOrder([combatant('slow', 5), combatant('fast', 30), combatant('mid', 15)]);
    expect(order.map((c) => c.id)).toEqual(['fast', 'mid', 'slow']);
  });

  it('速度が同じなら ID の昇順で固定する', () => {
    const order = turnOrder([combatant('b', 10), combatant('a', 10)]);
    expect(order.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('倒れている者は並ばない', () => {
    const order = turnOrder([combatant('down', 30, 0), combatant('alive', 10)]);
    expect(order.map((c) => c.id)).toEqual(['alive']);
  });

  it('速度バフを反映する', () => {
    const buffed = combatant('buffed', 10);
    buffed.effects = [
      { effect: { kind: 'statMod', stat: 'spd', rate: 1.0, turns: 3 }, remaining: 3 },
    ];
    const order = turnOrder([combatant('base', 15), buffed]);
    expect(order.map((c) => c.id)).toEqual(['buffed', 'base']);
  });

  it('渡された配列を並べ替えない', () => {
    const input = [combatant('slow', 5), combatant('fast', 30)];
    turnOrder(input);
    expect(input.map((c) => c.id)).toEqual(['slow', 'fast']);
  });
});

describe('isAlive', () => {
  it('HP が 0 なら false', () => {
    expect(isAlive(combatant('x', 10, 0))).toBe(false);
  });

  it('HP が残っていれば true', () => {
    expect(isAlive(combatant('x', 10, 1))).toBe(true);
  });
});
