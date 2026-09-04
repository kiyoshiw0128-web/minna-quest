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
  /**
   * 本来の挑発は「敵の狙いを自分に引きつける」効果だが、段階1の狙い先は
   * HP割合で決まる仕組みで、それを変えるのは戦闘エンジンへの変更になる。
   * ここでは仕様書4.2が名前を挙げている技として、engine が今支えられる
   * 「身を晒して守りを固める」自己バフとして実装する。引きつけ効果は段階4以降に送る。
   */
  provoke: {
    id: 'provoke', name: '挑発', mpCost: 6, cooldown: 3,
    element: 'none', target: 'self',
    effects: [
      { to: 'self', effect: { kind: 'statMod', stat: 'def', rate: 0.5, turns: 3 } },
      { to: 'self', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } },
    ],
  },
  focus: {
    id: 'focus', name: '精神統一', mpCost: 8, cooldown: 4,
    element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'statMod', stat: 'atk', rate: 0.5, turns: 3 } }],
  },
  flameArrow: {
    id: 'flameArrow', name: '火炎の矢', mpCost: 8, cooldown: 0,
    element: 'fire', target: 'enemy',
    damage: { kind: 'magical', power: 140 },
  },
  snipe: {
    id: 'snipe', name: '狙撃', mpCost: 10, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 200, pierce: 0.3 },
  },
  holyBlade: {
    id: 'holyBlade', name: '聖剣', mpCost: 14, cooldown: 2,
    element: 'holy', target: 'enemy',
    damage: { kind: 'physical', power: 240, pierce: 0.25 },
  },
  meteor: {
    id: 'meteor', name: 'メテオ', mpCost: 30, cooldown: 5,
    element: 'fire', target: 'allEnemies',
    damage: { kind: 'magical', power: 500 },
  },
} as const satisfies Record<string, Skill>;
