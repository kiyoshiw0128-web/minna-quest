import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';

const gnaw = { id: 'grainGnaw', name: 'かじりつく', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 70 } } as const satisfies Skill;
const ooze = { id: 'bogSplash', name: '泥しぶき', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'magical', power: 80 } } as const satisfies Skill;
const tusk = { id: 'brambleTusk', name: '牙で突く', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 90 } } as const satisfies Skill;
const windup = { id: 'questWindup', name: '踏みこむ構え', mpCost: 0, cooldown: 0, element: 'none', target: 'self', effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.3, turns: 1 } }] } as const satisfies Skill;
const rush = { id: 'questRush', name: '突進', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 150 } } as const satisfies Skill;
const pinch = { id: 'brinePinch', name: '大ばさみ', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 } } as const satisfies Skill;
const dive = { id: 'ridgeDive', name: '急降下', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 130 } } as const satisfies Skill;
const pulse = { id: 'starPulse', name: '星光の波', mpCost: 0, cooldown: 0, element: 'holy', target: 'allEnemies', damage: { kind: 'magical', power: 110 } } as const satisfies Skill;

/** 日数ではなく、序盤の少人数でも勝てる強さを基準にした探索戦。 */
export const QUEST_ENEMIES = {
  grainRat: { id: 'grainRat', name: '穀倉の大ネズミ', stats: { maxHp: 65, maxMp: 0, atk: 10, def: 2, mat: 5, mdf: 2, spd: 9 }, skills: [gnaw], pattern: [{ skillId: gnaw.id }] },
  bogSlime: { id: 'bogSlime', name: '濁り沼のスライム', stats: { maxHp: 85, maxMp: 0, atk: 8, def: 2, mat: 10, mdf: 3, spd: 7 }, skills: [ooze], pattern: [{ skillId: ooze.id }], resist: { fire: 1.4 } },
  brambleBoar: { id: 'brambleBoar', name: '茨まといの大猪', stats: { maxHp: 100, maxMp: 0, atk: 12, def: 4, mat: 5, mdf: 3, spd: 8 }, skills: [tusk, windup, rush], pattern: [{ skillId: tusk.id }, { skillId: windup.id }, { skillId: rush.id }], resist: { fire: 1.3 } },
  brineCrab: { id: 'brineCrab', name: '波止場の鎧ガニ', stats: { maxHp: 130, maxMp: 0, atk: 15, def: 12, mat: 6, mdf: 3, spd: 7 }, skills: [pinch, windup], pattern: [{ skillId: pinch.id }, { skillId: windup.id }], resist: { thunder: 1.5 } },
  ridgeHarrier: { id: 'ridgeHarrier', name: '白峰の怪鳥', stats: { maxHp: 155, maxMp: 0, atk: 18, def: 7, mat: 9, mdf: 7, spd: 15 }, skills: [windup, dive], pattern: [{ skillId: windup.id }, { skillId: dive.id }], resist: { ice: 1.4 } },
  starSentinel: { id: 'starSentinel', name: '星詠みの番人', stats: { maxHp: 230, maxMp: 0, atk: 18, def: 12, mat: 17, mdf: 12, spd: 9 }, skills: [windup, pulse, tusk], pattern: [{ skillId: windup.id }, { skillId: pulse.id }, { skillId: tusk.id }], resist: { dark: 1.4, holy: 0.7 } },
} as const satisfies Record<string, Enemy>;
