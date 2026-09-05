import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';

const dragonBreath = {
  id: 'dragonBreath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 180 },
} as const satisfies Skill;

const intimidate = {
  id: 'intimidate', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
} as const satisfies Skill;

const charge = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
} as const satisfies Skill;

const blazingBurst = {
  id: 'blazingBurst', name: '灼熱爆発', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 900 },
} as const satisfies Skill;

const frenzy = {
  id: 'frenzy', name: '狂乱の爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 260 },
} as const satisfies Skill;

/**
 * 第1章のボス。行動表はプレイヤーに全部見せる前提で組んである。
 * 3ターン目の「溜め」で立つ被ダメ+50%の窓に4ターン目の大技を集中させると、バルゴスが
 * 自分の4ターン目の番に回ってくる前に激昂して行動表が切り替わり、灼熱爆発は撃たれない
 * まま7ターン目に勝利するのが想定解。
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

/**
 * ここから雑魚敵。バルゴスの定義・数値は一切変えていない。
 *
 * どれも「冒険Lvと同じジョブLvの戦士が、そのジョブLvで習得済みの技だけを使って
 * 8ターン以内に勝てる」ことと「その半分のレベルでは勝てない」ことを実測して
 * 決めている（`computeStats` でLvNの戦士を作り `simulate` に通した。半分のレベルは
 * 8ターンでは削り切れない、または`voidWraith`のように途中で戦士が力尽きる）。
 * ダメージが除算式（`damage.ts`）なので、DEFを少し上げるだけで到達可能なHPの
 * 上限が大きく下がる。想定レベルにいわゆる「ちょうどいいDEF」を実測で探し、
 * そこから逆算してHPを決めた。
 *
 * 弱点・耐性は、プレイヤーの手持ち技（属性42個）に選ぶ余地を持たせるために
 * 種族ごとに割り振った。攻撃はどれも物理のみ：耐性はプレイヤーが撃ってくる
 * 属性技にだけ効き、敵自身の通常攻撃の属性には関係しない。
 */

const daggerStrike = {
  id: 'daggerStrike', name: '匕首の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/**
 * 冒険Lv1・ジョブLv1の戦士が slash 1本だけで挑む想定解。
 * HP90・DEF3は、実測でこの戦士のslash（1500/(100+DEF)）が7ターンで
 * 削り切れる上限から逆算した値。150〜400という当初の目安より低いが、
 * 「Lv1がslashだけで8ターン以内に勝てる」という制約が優先する
 * （このHPを超えると8ターンでは倒せなくなることを実測済み）。
 */
export const BANDIT_SCOUT = {
  id: 'banditScout',
  name: '山賊の見張り',
  stats: { maxHp: 90, maxMp: 0, atk: 12, def: 3, mat: 6, mdf: 4, spd: 11 },
  skills: [daggerStrike],
  pattern: [{ skillId: 'daggerStrike' }],
} as const satisfies Enemy;

const bite = {
  id: 'bite', name: '噛みつき', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv3で7ターンで勝てて、Lv1では8ターンでも削り切れない実測値。 */
export const FOREST_WOLF = {
  id: 'forestWolf',
  name: '森の狼',
  stats: { maxHp: 170, maxMp: 0, atk: 18, def: 10, mat: 9, mdf: 7, spd: 13 },
  skills: [bite],
  pattern: [{ skillId: 'bite' }],
  resist: { fire: 1.4, ice: 0.7 },
} as const satisfies Enemy;

const clubBlow = {
  id: 'clubBlow', name: '棍棒の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv5で7ターンで勝てて、Lv2では削り切れない実測値。第1章序盤の締め。 */
export const GOBLIN_RAIDER = {
  id: 'goblinRaider',
  name: 'ゴブリンの掠奪者',
  stats: { maxHp: 260, maxMp: 0, atk: 24, def: 10, mat: 10, mdf: 8, spd: 13 },
  skills: [clubBlow],
  pattern: [{ skillId: 'clubBlow' }],
  resist: { dark: 0.6, holy: 1.3 },
} as const satisfies Enemy;

const maulSwing = {
  id: 'maulSwing', name: '大槌の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 第1章後半の入り口。冒険Lv8で7ターンで勝てて、Lv4では削り切れない。 */
export const OGRE_BRUTE = {
  id: 'ogreBrute',
  name: '人喰い鬼',
  stats: { maxHp: 460, maxMp: 0, atk: 38, def: 15, mat: 15, mdf: 12, spd: 10 },
  skills: [maulSwing],
  pattern: [{ skillId: 'maulSwing' }],
  resist: { fire: 0.7, ice: 1.3 },
} as const satisfies Enemy;

const knightStrike = {
  id: 'knightStrike', name: '打ち下ろし', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
} as const satisfies Skill;

const knightIntimidate = {
  id: 'knightIntimidate', name: '威圧', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.2, turns: 2 } }],
} as const satisfies Skill;

const knightGuardDown = {
  id: 'knightGuardDown', name: '剣を構える', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
} as const satisfies Skill;

const knightSmash = {
  id: 'knightSmash', name: '渾身の斬撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 320 },
} as const satisfies Skill;

/**
 * バルゴス以外で唯一「溜め→大技」を持つ雑魚。3マス目の剣を構える（被ダメ+50%）に
 * 4マス目の渾身の斬撃が続くので、行動表を読んだプレイヤーはその窓に火力を
 * 集中できる。実測はこの読みを使わない素直な連打（貪欲プランナー）でも
 * 冒険Lv12で7ターンに収まることを確認しており、読みは近道であって必須ではない。
 */
export const ARMORED_KNIGHT = {
  id: 'armoredKnight',
  name: '鎧の廃騎士',
  stats: { maxHp: 650, maxMp: 0, atk: 50, def: 15, mat: 25, mdf: 15, spd: 14 },
  skills: [knightStrike, knightIntimidate, knightGuardDown, knightSmash],
  pattern: [
    { skillId: 'knightStrike' },
    { skillId: 'knightIntimidate' },
    { skillId: 'knightGuardDown' },
    { skillId: 'knightSmash' },
  ],
  resist: { dark: 0.6, holy: 1.5 },
} as const satisfies Enemy;

const clawRake = {
  id: 'clawRake', name: '爪撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 第2章の入り口。冒険Lv18（渾身の一撃を覚えた戦士）で7ターンで勝てる。 */
export const DIRE_WYVERN = {
  id: 'direWyvern',
  name: '悪竜の眷属',
  stats: { maxHp: 1350, maxMp: 0, atk: 75, def: 15, mat: 38, mdf: 20, spd: 18 },
  skills: [clawRake],
  pattern: [{ skillId: 'clawRake' }],
  resist: { fire: 0.6, ice: 1.4 },
} as const satisfies Enemy;

const rockFist = {
  id: 'rockFist', name: '岩拳', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv21で7ターンで勝てる実測値。 */
export const STONE_GOLEM = {
  id: 'stoneGolem',
  name: '石の巨人',
  stats: { maxHp: 1600, maxMp: 0, atk: 95, def: 15, mat: 10, mdf: 30, spd: 8 },
  skills: [rockFist],
  pattern: [{ skillId: 'rockFist' }],
  resist: { fire: 0.6, thunder: 1.4 },
} as const satisfies Enemy;

const shadowClaw = {
  id: 'shadowClaw', name: '影爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/**
 * 第2章の最強格の雑魚。冒険Lv23（大地断裂を覚えた戦士）で7ターンで勝てて、
 * Lv11では8ターン以内に戦士側が力尽きる（他の雑魚は削り切れないだけで
 * 済んだが、これは実際に負ける）。バルゴスに次ぐ強さとして激昂は付けず、
 * 純粋な火力で差をつけた。
 */
export const VOID_WRAITH = {
  id: 'voidWraith',
  name: '影を纏う亡霊',
  stats: { maxHp: 2500, maxMp: 0, atk: 110, def: 15, mat: 55, mdf: 25, spd: 20 },
  skills: [shadowClaw],
  pattern: [{ skillId: 'shadowClaw' }],
  resist: { dark: 0.5, holy: 1.6 },
} as const satisfies Enemy;

export const ENEMIES = {
  balgos: BALGOS,
  banditScout: BANDIT_SCOUT,
  forestWolf: FOREST_WOLF,
  goblinRaider: GOBLIN_RAIDER,
  ogreBrute: OGRE_BRUTE,
  armoredKnight: ARMORED_KNIGHT,
  direWyvern: DIRE_WYVERN,
  stoneGolem: STONE_GOLEM,
  voidWraith: VOID_WRAITH,
} as const satisfies Record<string, Enemy>;
