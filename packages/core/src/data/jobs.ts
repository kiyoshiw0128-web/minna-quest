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
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 4, kind: 'skill', id: 'provoke' },
      { level: 8, kind: 'skill', id: 'armorBreak' },
      { level: 12, kind: 'skill', id: 'heavyBlow' },
      { level: 16, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [],
  },
  monk: {
    id: 'monk', name: '武闘家', tier: 'basic',
    statBonus: { atk: 4, spd: 1, maxHp: 5 },
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 5, kind: 'skill', id: 'focus' },
      { level: 10, kind: 'passive', id: 'battleInstinct' },
      { level: 15, kind: 'skill', id: 'heavyBlow' },
      { level: 20, kind: 'passive', id: 'swiftFoot' },
    ],
    requires: [],
  },
  mage: {
    id: 'mage', name: '魔法使い', tier: 'basic',
    statBonus: { mat: 4, maxMp: 3 },
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 6, kind: 'passive', id: 'arcaneMind' },
      { level: 12, kind: 'skill', id: 'blizzard' },
    ],
    requires: [],
  },
  priest: {
    id: 'priest', name: '僧侶', tier: 'basic',
    statBonus: { mdf: 3, mat: 2, maxMp: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 7, kind: 'skill', id: 'guardChant' },
      { level: 14, kind: 'passive', id: 'arcaneMind' },
    ],
    requires: [],
  },
  thief: {
    id: 'thief', name: '盗賊', tier: 'basic',
    statBonus: { spd: 2, atk: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 5, kind: 'skill', id: 'poisonDagger' },
      { level: 10, kind: 'passive', id: 'swiftFoot' },
      { level: 16, kind: 'skill', id: 'armorBreak' },
    ],
    requires: [],
  },
  ranger: {
    id: 'ranger', name: '狩人', tier: 'basic',
    statBonus: { atk: 2, spd: 2, mat: 1 },
    learnset: [
      { level: 1, kind: 'skill', id: 'flameArrow' },
      { level: 8, kind: 'skill', id: 'snipe' },
      { level: 14, kind: 'passive', id: 'battleInstinct' },
    ],
    requires: [],
  },
  paladin: {
    id: 'paladin', name: 'パラディン', tier: 'advanced',
    statBonus: { atk: 3, def: 4, mdf: 3, maxHp: 10 },
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 5, kind: 'skill', id: 'guardChant' },
      { level: 10, kind: 'skill', id: 'holyBlade' },
      { level: 20, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [
      { jobId: 'warrior', level: 20 },
      { jobId: 'priest', level: 15 },
    ],
  },
  spellblade: {
    id: 'spellblade', name: '魔剣士', tier: 'advanced',
    statBonus: { atk: 3, mat: 3, maxMp: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 5, kind: 'skill', id: 'heavyBlow' },
      { level: 12, kind: 'skill', id: 'blizzard' },
    ],
    requires: [
      { jobId: 'warrior', level: 15 },
      { jobId: 'mage', level: 20 },
    ],
  },
  sage: {
    id: 'sage', name: '賢者', tier: 'advanced',
    statBonus: { mat: 5, mdf: 3, maxMp: 4 },
    learnset: [
      { level: 1, kind: 'skill', id: 'blizzard' },
      { level: 5, kind: 'skill', id: 'holyLight' },
      { level: 10, kind: 'passive', id: 'arcaneMind' },
      { level: 20, kind: 'skill', id: 'meteor' },
    ],
    requires: [
      { jobId: 'mage', level: 20 },
      { jobId: 'priest', level: 20 },
    ],
  },
} as const satisfies Record<string, Job>;
