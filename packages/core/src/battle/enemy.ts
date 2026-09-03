import type { Element, StatBlock } from './types.js';
import type { Skill } from './skill.js';

/** 行動表の1マス。ターン数で割った余りの位置が使われる。 */
export type EnemyPatternEntry = { skillId: string };

export type Enemy = {
  id: string;
  name: string;
  stats: StatBlock;
  skills: readonly Skill[];
  /** 属性ごとの倍率。1.5 なら弱点、0.5 なら耐性。未指定は 1 */
  resist?: Partial<Record<Element, number>>;
  pattern: readonly EnemyPatternEntry[];
  /** HP がこの割合以下になったら行動表が切り替わる */
  enrage?: { hpRate: number; pattern: readonly EnemyPatternEntry[] };
};
