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

/**
 * 浮動小数点の丸め誤差を吸収するための微小値。
 * この式が意図する値は常に整数だが、`GROWTH_PER_LEVEL` の小数（spd の
 * 1.2 など）と素質倍率（1.15 など）を掛け合わせる過程で 1e-13 程度の
 * 誤差が生じることがあり、そのまま Math.floor すると意図した整数より
 * 1 小さい値になってしまう。誤差の桁より十分大きく、意図した整数同士の
 * 差（最小 1）よりは十分小さい値として 1e-9 を使う。
 */
const FLOAT_EPSILON = 1e-9;

/** 単一ステータスについて、素の値・冒険レベルの伸び・職業補正を合算し、整数に丸めて返す。 */
function computeStat(
  key: keyof StatBlock,
  character: Character,
  job: Job,
  levels: number,
  jobLevel: number,
): number {
  const grown = GROWTH_PER_LEVEL[key] * levels * aptitudeMultiplier(character.aptitude[key]);
  const bonus = (job.statBonus[key] ?? 0) * jobLevel;
  return Math.max(1, Math.floor(BASE_STATS[key] + grown + bonus + FLOAT_EPSILON));
}

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

  return {
    maxHp: computeStat('maxHp', character, job, levels, jobLevel),
    maxMp: computeStat('maxMp', character, job, levels, jobLevel),
    atk: computeStat('atk', character, job, levels, jobLevel),
    def: computeStat('def', character, job, levels, jobLevel),
    mat: computeStat('mat', character, job, levels, jobLevel),
    mdf: computeStat('mdf', character, job, levels, jobLevel),
    spd: computeStat('spd', character, job, levels, jobLevel),
  };
}
