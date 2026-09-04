import type { Job } from '../progression/job.js';

/**
 * 職業のマスタ。基本6 + 上級3。
 * 上級職の条件は仕様書4.3に合わせてある。
 * statBonus はジョブレベル1つあたりの加算。
 */
export const JOBS = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic',
    statBonus: { atk: 3, def: 2, maxHp: 8 },
    // ATK主体。shieldSmash（DEF技）を1本入れて「固めて殴る」を体現する。
    // 終盤にはguardianStance（被ダメ軽減）を足し、耐久面も併せて厚くする。
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 4, kind: 'skill', id: 'provoke' },
      { level: 8, kind: 'skill', id: 'shieldSmash' },
      { level: 12, kind: 'skill', id: 'armorBreak' },
      { level: 15, kind: 'passive', id: 'ironSkin' },
      { level: 18, kind: 'skill', id: 'heavyBlow' },
      { level: 23, kind: 'skill', id: 'earthRend' },
      { level: 25, kind: 'passive', id: 'guardianStance' },
    ],
    requires: [],
  },
  monk: {
    id: 'monk', name: '武闘家', tier: 'basic',
    statBonus: { atk: 4, spd: 1, maxHp: 5 },
    // ATK主体の連打・自己バフ。galeKick（SPD技）を1本だけ持たせる。
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 4, kind: 'skill', id: 'risingFist' },
      { level: 8, kind: 'skill', id: 'spiritEdge' },
      { level: 10, kind: 'passive', id: 'battleInstinct' },
      { level: 12, kind: 'skill', id: 'focus' },
      { level: 16, kind: 'skill', id: 'galeKick' },
      { level: 21, kind: 'skill', id: 'heavyBlow' },
      { level: 24, kind: 'passive', id: 'berserkerFury' },
    ],
    requires: [],
  },
  mage: {
    id: 'mage', name: '魔法使い', tier: 'basic',
    statBonus: { mat: 4, maxMp: 3 },
    // MAT主体。氷（iceLance/iceCoffin/blizzard）と雷（thunderBolt/thunderStorm）で
    // 属性を分け、どちらの耐性を突かれても選べるようにする。
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 4, kind: 'skill', id: 'manaBolt' },
      { level: 8, kind: 'skill', id: 'thunderBolt' },
      { level: 10, kind: 'passive', id: 'arcaneMind' },
      { level: 12, kind: 'skill', id: 'iceCoffin' },
      { level: 16, kind: 'skill', id: 'blizzard' },
      { level: 21, kind: 'skill', id: 'thunderStorm' },
      { level: 24, kind: 'passive', id: 'mysticFocus' },
    ],
    requires: [],
  },
  priest: {
    id: 'priest', name: '僧侶', tier: 'basic',
    statBonus: { mdf: 3, mat: 2, maxMp: 2 },
    // 回復と支援が主軸。prayerOfMercyとgroupHealはhealScale:'mdf'で、
    // statBonusのmdf3がそのまま回復量に乗るようにしてある。
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 5, kind: 'skill', id: 'guardChant' },
      { level: 9, kind: 'skill', id: 'prayerOfMercy' },
      { level: 11, kind: 'passive', id: 'stoneWill' },
      { level: 13, kind: 'skill', id: 'sacredFlame' },
      { level: 17, kind: 'skill', id: 'groupHeal' },
      { level: 22, kind: 'skill', id: 'holyNova' },
      { level: 25, kind: 'passive', id: 'holyBlessing' },
    ],
    requires: [],
  },
  thief: {
    id: 'thief', name: '盗賊', tier: 'basic',
    statBonus: { spd: 2, atk: 2 },
    // SPDで伸びる技（swiftStrike）が主軸。legSweepでSPDデバフ、
    // armorBreakとshadowExecute（割合ダメージ）で貫通の両方を持たせる。
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 4, kind: 'skill', id: 'poisonDagger' },
      { level: 8, kind: 'skill', id: 'swiftStrike' },
      { level: 10, kind: 'passive', id: 'swiftFoot' },
      { level: 12, kind: 'skill', id: 'legSweep' },
      { level: 16, kind: 'skill', id: 'armorBreak' },
      { level: 21, kind: 'skill', id: 'shadowExecute' },
      { level: 24, kind: 'passive', id: 'lightFeet' },
    ],
    requires: [],
  },
  ranger: {
    id: 'ranger', name: '狩人', tier: 'basic',
    statBonus: { atk: 2, spd: 2, mat: 1 },
    // 遠隔。SPDで伸びる物理（windArrow）とMATで伸びる属性矢
    // （flameArrow/thunderArrow）の両方を持つ。
    learnset: [
      { level: 1, kind: 'skill', id: 'hawkEye' },
      { level: 4, kind: 'skill', id: 'flameArrow' },
      { level: 8, kind: 'skill', id: 'snipe' },
      { level: 12, kind: 'skill', id: 'windArrow' },
      { level: 14, kind: 'passive', id: 'battleInstinct' },
      { level: 17, kind: 'skill', id: 'thunderArrow' },
      { level: 21, kind: 'skill', id: 'vitalShot' },
      { level: 24, kind: 'passive', id: 'lightFeet' },
    ],
    requires: [],
  },
  paladin: {
    id: 'paladin', name: 'パラディン', tier: 'advanced',
    statBonus: { atk: 3, def: 4, mdf: 3, maxHp: 10 },
    // DEFで伸びる技（shieldSmash・judgmentShield）が主軸。「守りが攻めになる」を
    // 2本のDEF技で体現し、adamantGuard/absoluteGuardで耐久も最後まで伸ばす。
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 6, kind: 'skill', id: 'guardChant' },
      { level: 9, kind: 'skill', id: 'shieldSmash' },
      { level: 13, kind: 'skill', id: 'vowOfProtection' },
      { level: 16, kind: 'passive', id: 'adamantGuard' },
      { level: 18, kind: 'skill', id: 'judgmentShield' },
      { level: 23, kind: 'skill', id: 'holyBlade' },
      { level: 25, kind: 'passive', id: 'absoluteGuard' },
    ],
    requires: [
      { jobId: 'warrior', level: 20 },
      { jobId: 'priest', level: 15 },
    ],
  },
  spellblade: {
    id: 'spellblade', name: '魔剣士', tier: 'advanced',
    statBonus: { atk: 3, mat: 3, maxMp: 2 },
    // ATKとMATを両方使う。flameEdge/thunderEdgeは物理だが属性を乗せてあり、
    // 「属性を乗せた物理」をそのまま体現する。
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 4, kind: 'skill', id: 'iceShard' },
      { level: 8, kind: 'skill', id: 'flameEdge' },
      { level: 10, kind: 'passive', id: 'berserkerFury' },
      { level: 12, kind: 'skill', id: 'heavyBlow' },
      { level: 16, kind: 'skill', id: 'thunderEdge' },
      { level: 21, kind: 'skill', id: 'blizzard' },
      { level: 24, kind: 'passive', id: 'arcaneMind' },
    ],
    requires: [
      { jobId: 'warrior', level: 15 },
      { jobId: 'mage', level: 20 },
    ],
  },
  sage: {
    id: 'sage', name: '賢者', tier: 'advanced',
    statBonus: { mat: 5, mdf: 3, maxMp: 4 },
    // MAT主体の大技（blizzard/iceCrystal/meteor）に加えて、
    // sagesWisdom（healScale:'mdf'）でMDFの支援も持たせる。
    learnset: [
      { level: 1, kind: 'skill', id: 'blizzard' },
      { level: 4, kind: 'skill', id: 'curseBolt' },
      { level: 8, kind: 'skill', id: 'holyLight' },
      { level: 10, kind: 'passive', id: 'mysticFocus' },
      { level: 12, kind: 'skill', id: 'sagesWisdom' },
      { level: 16, kind: 'skill', id: 'iceCrystal' },
      { level: 21, kind: 'passive', id: 'holyBlessing' },
      { level: 24, kind: 'skill', id: 'meteor' },
    ],
    requires: [
      { jobId: 'mage', level: 20 },
      { jobId: 'priest', level: 20 },
    ],
  },
} as const satisfies Record<string, Job>;
