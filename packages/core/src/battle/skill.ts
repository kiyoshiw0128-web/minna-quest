import type { DamageSpec, Element } from './types.js';
import type { Effect } from './effects.js';

/**
 * 誰を狙うか。すべて決定論的に決まる。
 * - enemy        相手側で HP割合が最も低い生存者（同率なら ID 昇順）
 * - allEnemies   相手側の生存者すべて
 * - lowestHpAlly 自分側で HP割合が最も低い生存者（同率なら ID 昇順）
 * - allAllies    自分側の生存者すべて
 * - self         自分自身
 */
export type SkillTarget = 'enemy' | 'allEnemies' | 'lowestHpAlly' | 'allAllies' | 'self';

export type Skill = {
  id: string;
  name: string;
  /** 消費MP。パーティ全体ではなく本人の MP から引く */
  mpCost: number;
  /** 使った後、何ターン空ければ再び使えるか。0 なら毎ターン使える */
  cooldown: number;
  element: Element;
  target: SkillTarget;
  damage?: DamageSpec;
  /** 回復量。使用者の実効 MAT に対する百分率。100 なら MAT と等倍 */
  heal?: number;
  effects?: { to: 'target' | 'self'; effect: Effect }[];
};
