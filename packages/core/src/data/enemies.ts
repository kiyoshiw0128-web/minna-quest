import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';

const dragonBreath: Skill = {
  id: 'dragonBreath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 180 },
};

const intimidate: Skill = {
  id: 'intimidate', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};

const charge: Skill = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
};

const blazingBurst: Skill = {
  id: 'blazingBurst', name: '灼熱爆発', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 900 },
};

const frenzy: Skill = {
  id: 'frenzy', name: '狂乱の爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 260 },
};

/**
 * 第1章のボス。行動表はプレイヤーに全部見せる前提で組んである。
 * 3ターン目の「溜め」に火力を集中させ、4ターン目の灼熱爆発の前に削り切るのが想定解。
 *
 * HP 4800 は設計書 3.1 が公開している数値そのまま。ここの数値はプレイヤーに
 * 見せる読み物の一部なので、テストの都合で動かさない。
 * 4800 が成立することは boss.test.ts で確認している:
 * 想定解は7ターンで勝ち、通常攻撃を並べただけの並びは4ターン目の灼熱爆発で全滅する。
 */
export const BALGOS = {
  id: 'balgos',
  name: '炎竜バルゴス',
  stats: { maxHp: 4800, maxMp: 999, atk: 140, def: 60, mat: 130, mdf: 40, spd: 12 },
  skills: [dragonBreath, intimidate, charge, blazingBurst, frenzy],
  resist: { fire: 0.5, ice: 1.5 },
  pattern: [
    { skillId: 'dragonBreath' },
    { skillId: 'intimidate' },
    { skillId: 'charge' },
    { skillId: 'blazingBurst' },
  ],
  enrage: {
    hpRate: 0.5,
    pattern: [{ skillId: 'frenzy' }, { skillId: 'dragonBreath' }],
  },
} as const satisfies Enemy;

export const ENEMIES = { balgos: BALGOS } as const satisfies Record<string, Enemy>;
