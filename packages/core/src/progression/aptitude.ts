import type { Grade } from './types.js';

/**
 * 素質の倍率。レベルごとの伸びにだけ掛かるので、
 * 差はレベルが上がるほど開いていく。
 */
const MULTIPLIER: Readonly<Record<Grade, number>> = {
  A: 1.3,
  B: 1.15,
  C: 1.0,
  D: 0.85,
  E: 0.7,
};

export function aptitudeMultiplier(grade: Grade): number {
  return MULTIPLIER[grade];
}
