import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import type { PartyMember } from '../../src/battle/state.js';

const warrior: PartyMember = {
  id: 'warrior', name: '戦士',
  stats: { maxHp: 900, maxMp: 60, atk: 150, def: 80, mat: 40, mdf: 40, spd: 22 },
  skills: [SKILLS.slash, SKILLS.heavyBlow, SKILLS.armorBreak],
};

const mage: PartyMember = {
  id: 'mage', name: '魔法使い',
  stats: { maxHp: 620, maxMp: 110, atk: 50, def: 40, mat: 165, mdf: 70, spd: 18 },
  skills: [SKILLS.iceLance, SKILLS.blizzard],
};

const priest: PartyMember = {
  id: 'priest', name: '僧侶',
  stats: { maxHp: 700, maxMp: 100, atk: 60, def: 55, mat: 130, mdf: 85, spd: 15 },
  skills: [SKILLS.holyLight, SKILLS.guardChant],
};

const thief: PartyMember = {
  id: 'thief', name: '盗賊',
  stats: { maxHp: 660, maxMp: 70, atk: 110, def: 50, mat: 60, mdf: 50, spd: 30 },
  skills: [SKILLS.slash, SKILLS.poisonDagger],
};

const party = [warrior, mage, priest, thief];

describe('炎竜バルゴス', () => {
  it('溜めターンに火力を集中させる並びなら勝てる', () => {
    const plan: BattlePlan = {
      warrior: ['armorBreak', 'slash', 'heavyBlow', 'slash', 'heavyBlow', 'slash', 'slash', 'slash'],
      mage: ['iceLance', 'iceLance', 'blizzard', 'iceLance', 'blizzard', 'iceLance', 'iceLance', 'iceLance'],
      priest: ['guardChant', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight'],
      thief: ['poisonDagger', 'slash', 'poisonDagger', 'slash', 'poisonDagger', 'slash', 'slash', 'slash'],
    };
    expect(simulate(party, BALGOS, plan).result).toBe('win');
  });

  it('通常攻撃を並べただけでは勝てない', () => {
    const lazy = ['slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash'];
    const plan: BattlePlan = {
      warrior: lazy,
      mage: ['iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance'],
      priest: lazy,
      thief: lazy,
    };
    expect(simulate(party, BALGOS, plan).result).not.toBe('win');
  });

  it('半分まで削ると激昂する', () => {
    const plan: BattlePlan = {
      warrior: ['armorBreak', 'heavyBlow', 'slash', 'heavyBlow', 'slash', 'slash', 'slash', 'slash'],
      mage: ['blizzard', 'iceLance', 'iceLance', 'blizzard', 'iceLance', 'iceLance', 'iceLance', 'iceLance'],
      priest: ['holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight'],
      thief: ['poisonDagger', 'slash', 'poisonDagger', 'slash', 'slash', 'slash', 'slash', 'slash'],
    };
    const log = simulate(party, BALGOS, plan);
    expect(log.events.some((e) => e.t === 'enrage')).toBe(true);
  });

  it('同じ入力からは同じ結果が出る', () => {
    const plan: BattlePlan = { warrior: ['slash'], mage: ['iceLance'], priest: ['holyLight'], thief: ['slash'] };
    expect(simulate(party, BALGOS, plan)).toEqual(simulate(party, BALGOS, plan));
  });
});
