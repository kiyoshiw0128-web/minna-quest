import type { StatBlock } from '../battle/types.js';
import { aptitudeMultiplier } from './aptitude.js';
import type { Character } from './types.js';
import type { Job } from './job.js';

/** 冒険レベル1・素質不問のときの素の値。 */
export const BASE_STATS: StatBlock = {
  maxHp: 120, maxMp: 20, atk: 12, def: 10, mat: 10, mdf: 10, spd: 10,
};

/** 冒険レベルが1上がるごとの伸び（素質Cのとき）。 */
export const GROWTH_PER_LEVEL: StatBlock = {
  maxHp: 28, maxMp: 6, atk: 4, def: 3, mat: 3, mdf: 3, spd: 1.2,
};

const STAT_KEYS = ['maxHp', 'maxMp', 'atk', 'def', 'mat', 'mdf', 'spd'] as const;

/**
 * キャラの実効ステータスを求める。
 *
 *   素の値 + 冒険レベルの伸び × 素質 + 現在の職業の補正 × ジョブレベル
 *
 * 素質を伸びにだけ掛けるのは、差がレベルとともに開いていくようにするため。
 * 冒険レベルは転職しても下がらないので、この式の第2項は転職で失われない。
 */
export function computeStats(character: Character, job: Job): StatBlock {
  const levels = character.adventureLevel - 1;
  const jobLevel = character.jobs[character.currentJob]?.level ?? 1;

  const stats = {} as Record<keyof StatBlock, number>;
  for (const key of STAT_KEYS) {
    const grown = GROWTH_PER_LEVEL[key] * levels * aptitudeMultiplier(character.aptitude[key]);
    const bonus = (job.statBonus[key] ?? 0) * jobLevel;
    stats[key] = Math.max(1, Math.floor(BASE_STATS[key] + grown + bonus));
  }
  return stats;
}
