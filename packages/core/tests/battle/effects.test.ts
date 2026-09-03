import { describe, it, expect } from 'vitest';
import {
  effectiveStat,
  damageTakenRate,
  isStunned,
  applyEffect,
  tickEffects,
} from '../../src/battle/effects.js';
import type { ActiveEffect } from '../../src/battle/effects.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 100, def: 50, mat: 60, mdf: 40, spd: 20,
};

describe('effectiveStat', () => {
  it('効果が無ければ素の値を返す', () => {
    expect(effectiveStat(stats, 'atk', [])).toBe(100);
  });

  it('デバフのぶんだけ下がる', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 }, remaining: 3, appliedTurn: 1 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(70);
  });

  it('同じステータスへの効果は足し算で重なる', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 }, remaining: 3, appliedTurn: 1 },
      { effect: { kind: 'statMod', stat: 'atk', rate: 0.5, turns: 2 }, remaining: 2, appliedTurn: 1 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(120);
  });

  it('別のステータスへの効果は影響しない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'def', rate: -0.5, turns: 3 }, remaining: 3, appliedTurn: 1 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(100);
  });

  it('どれだけ下げられても素の10%を下回らない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -5, turns: 1 }, remaining: 1, appliedTurn: 1 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(10);
  });
});

describe('damageTakenRate', () => {
  it('効果が無ければ 1', () => {
    expect(damageTakenRate([])).toBe(1);
  });

  it('溜め中は被ダメージが増える', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 1 }, remaining: 1, appliedTurn: 1 },
    ];
    expect(damageTakenRate(actives)).toBe(1.5);
  });
});

describe('isStunned', () => {
  it('スタン効果があれば true', () => {
    const actives: ActiveEffect[] = [{ effect: { kind: 'stun', turns: 1 }, remaining: 1, appliedTurn: 1 }];
    expect(isStunned(actives)).toBe(true);
  });

  it('無ければ false', () => {
    expect(isStunned([])).toBe(false);
  });
});

describe('applyEffect', () => {
  it('残りターン数と付与ターンつきで追加し、元の配列は変えない', () => {
    const before: ActiveEffect[] = [];
    const after = applyEffect(before, { kind: 'stun', turns: 2 }, 3);
    expect(after).toHaveLength(1);
    expect(after[0].remaining).toBe(2);
    expect(after[0].appliedTurn).toBe(3);
    expect(before).toHaveLength(0);
  });
});

describe('tickEffects', () => {
  it('残りターンを1減らし、0になったものを切り離す', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'stun', turns: 1 }, remaining: 1, appliedTurn: 1 },
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 3 }, remaining: 3, appliedTurn: 1 },
    ];
    const { remaining, expired } = tickEffects(actives, 2);
    expect(expired).toHaveLength(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].remaining).toBe(2);
  });

  it('元の配列を書き換えない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 3 }, remaining: 3, appliedTurn: 1 },
    ];
    tickEffects(actives, 2);
    expect(actives).toEqual([
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 3 }, remaining: 3, appliedTurn: 1 },
    ]);
  });

  it('付与されたそのターンの終わりには減らない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 1 }, remaining: 1, appliedTurn: 3 },
    ];
    const { remaining, expired } = tickEffects(actives, 3);
    expect(expired).toHaveLength(0);
    expect(remaining[0].remaining).toBe(1);
  });

  it('turns:1 の効果は付与の次のターンの終わりに切れる', () => {
    const applied = applyEffect([], { kind: 'damageTaken', rate: 0.5, turns: 1 }, 3);
    const afterOwnTurn = tickEffects(applied, 3).remaining;
    expect(afterOwnTurn).toHaveLength(1);
    const afterNextTurn = tickEffects(afterOwnTurn, 4);
    expect(afterNextTurn.remaining).toHaveLength(0);
    expect(afterNextTurn.expired).toHaveLength(1);
  });

  it('永続効果（パッシブ）は減らない', () => {
    const actives: ActiveEffect[] = [
      {
        effect: { kind: 'statMod', stat: 'spd', rate: 0.1, turns: Infinity },
        remaining: Infinity,
        appliedTurn: 0,
      },
    ];
    const { remaining, expired } = tickEffects(actives, 5);
    expect(expired).toHaveLength(0);
    expect(remaining[0].remaining).toBe(Infinity);
  });
});
