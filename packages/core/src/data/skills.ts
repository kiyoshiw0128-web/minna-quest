import type { Skill } from '../battle/skill.js';

/** 技のマスタ。バランス調整はここの数値をいじる。 */
export const SKILLS = {
  slash: {
    id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 100 },
  },
  heavyBlow: {
    id: 'heavyBlow', name: '渾身の一撃', mpCost: 14, cooldown: 3,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 320 },
  },
  armorBreak: {
    id: 'armorBreak', name: '鎧砕き', mpCost: 10, cooldown: 4,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 80, pierce: 0.5 },
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'def', rate: -0.4, turns: 3 } }],
  },
  iceLance: {
    id: 'iceLance', name: '氷の槍', mpCost: 12, cooldown: 0,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 180 },
  },
  blizzard: {
    id: 'blizzard', name: '氷嵐', mpCost: 24, cooldown: 3,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 380 },
  },
  holyLight: {
    id: 'holyLight', name: '癒やしの光', mpCost: 9, cooldown: 0,
    element: 'holy', target: 'lowestHpAlly',
    heal: 160,
  },
  guardChant: {
    id: 'guardChant', name: '守りの詠唱', mpCost: 8, cooldown: 4,
    element: 'holy', target: 'allAllies',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } }],
  },
  poisonDagger: {
    id: 'poisonDagger', name: '毒短剣', mpCost: 6, cooldown: 2,
    element: 'dark', target: 'enemy',
    damage: { kind: 'fixed', amount: 120 },
  },
} as const satisfies Record<string, Skill>;
