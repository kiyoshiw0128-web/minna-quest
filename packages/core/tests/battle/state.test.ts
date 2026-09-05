import { describe, it, expect } from 'vitest';
import { createBattleState, findCombatant, updateCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 100, def: 50, mat: 60, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [slash] };

const dummy: Enemy = {
  id: 'dummy', name: '木人',
  stats: { ...stats, maxHp: 1000, spd: 5 },
  skills: [slash],
  pattern: [{ skillId: 'slash' }],
};

describe('createBattleState', () => {
  it('味方と敵を満タンの HP・MP で並べる', () => {
    const state = createBattleState([hero], dummy);
    expect(state.turn).toBe(1);
    expect(state.combatants).toHaveLength(2);
    expect(findCombatant(state, 'hero').hp).toBe(500);
    expect(findCombatant(state, 'dummy').hp).toBe(1000);
  });

  it('味方は ally、敵は enemy になる', () => {
    const state = createBattleState([hero], dummy);
    expect(findCombatant(state, 'hero').side).toBe('ally');
    expect(findCombatant(state, 'dummy').side).toBe('enemy');
  });

  it('パッシブは永続の効果として最初から付いている', () => {
    const withPet: PartyMember = {
      ...hero,
      passives: [{ kind: 'statMod', stat: 'spd', rate: 0.1, turns: Infinity }],
    };
    const state = createBattleState([withPet], dummy);
    expect(findCombatant(state, 'hero').effects).toHaveLength(1);
    expect(findCombatant(state, 'hero').effects[0].remaining).toBe(Infinity);
  });

  it('激昂はまだ起きていない', () => {
    expect(createBattleState([hero], dummy).enraged).toBe(false);
  });

  // ペットの効果（段階6・設計書 §6）。個々のキャラの passives とは別枠で、
  // パーティ全員に一律で足し込まれる。
  it('initialEffects はパーティ全員に、各自の passives とは別枠で足し込まれる', () => {
    const withPassive: PartyMember = {
      ...hero,
      passives: [{ kind: 'statMod', stat: 'atk', rate: 0.2, turns: Infinity }],
    };
    const petEffect = { kind: 'statMod' as const, stat: 'spd' as const, rate: 0.1, turns: Infinity };
    const state = createBattleState([withPassive], dummy, [petEffect]);
    const effects = findCombatant(state, 'hero').effects;
    expect(effects).toHaveLength(2);
    expect(effects.map((active) => active.effect)).toEqual([
      { kind: 'statMod', stat: 'atk', rate: 0.2, turns: Infinity },
      petEffect,
    ]);
    expect(effects.every((active) => active.remaining === Infinity)).toBe(true);
  });

  it('initialEffects を渡さなければ今までと完全に同じ（既定は空・後方互換）', () => {
    const withDefault = createBattleState([hero], dummy);
    const withEmptyArray = createBattleState([hero], dummy, []);
    expect(withDefault).toEqual(withEmptyArray);
    expect(findCombatant(withDefault, 'hero').effects).toEqual([]);
  });
});

describe('updateCombatant', () => {
  it('指定した1人だけを差し替えた新しい状態を返す', () => {
    const before = createBattleState([hero], dummy);
    const after = updateCombatant(before, 'hero', (c) => ({ ...c, hp: 100 }));
    expect(findCombatant(after, 'hero').hp).toBe(100);
    expect(findCombatant(after, 'dummy').hp).toBe(1000);
  });

  it('元の状態を書き換えない', () => {
    const before = createBattleState([hero], dummy);
    updateCombatant(before, 'hero', (c) => ({ ...c, hp: 100 }));
    expect(findCombatant(before, 'hero').hp).toBe(500);
  });
});

describe('findCombatant', () => {
  it('いない ID を引いたら投げる', () => {
    const state = createBattleState([hero], dummy);
    expect(() => findCombatant(state, 'nobody')).toThrow('unknown combatant: nobody');
  });
});
