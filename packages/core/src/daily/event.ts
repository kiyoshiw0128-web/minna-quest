import { drawWithout } from './rng.js';

/** 1日に提示する選択肢の数。 */
export const OPTIONS_PER_DAY = 3;

/** battle は雑魚戦、story は戦闘を伴わない出来事。 */
export type EventKind = 'battle' | 'story';

/** 世界の状態。イベントの出現条件はこれを見る。 */
export type WorldFlags = {
  readonly chapter: number;
  /** 通ってきたルートで獲得したフラグ */
  readonly tags: readonly string[];
};

/** 出現条件。指定しなかった項目は制約しない。 */
export type EventCondition = {
  readonly minChapter?: number;
  readonly maxChapter?: number;
  readonly requiresTags?: readonly string[];
  readonly forbidsTags?: readonly string[];
};

/** 非戦闘イベントを選んだ結果。 */
export type EventOutcome = {
  readonly gold?: number;
  readonly addTags?: readonly string[];
  readonly petId?: string;
};

export type DailyEvent = {
  readonly id: string;
  readonly name: string;
  readonly kind: EventKind;
  /** kind が 'battle' のとき、戦う相手のID */
  readonly enemyId?: string;
  /** kind が 'story' のとき、選んだ結果 */
  readonly outcome?: EventOutcome;
  readonly condition: EventCondition;
};

export function matchesCondition(condition: EventCondition, flags: WorldFlags): boolean {
  if (condition.minChapter !== undefined && flags.chapter < condition.minChapter) return false;
  if (condition.maxChapter !== undefined && flags.chapter > condition.maxChapter) return false;
  if (condition.requiresTags?.some((tag) => !flags.tags.includes(tag))) return false;
  if (condition.forbidsTags?.some((tag) => flags.tags.includes(tag))) return false;
  return true;
}

/** 今の世界の状態で出現しうるイベント。プールの並び順は保つ。 */
export function eligibleEvents(
  pool: readonly DailyEvent[],
  flags: WorldFlags,
): readonly DailyEvent[] {
  return pool.filter((event) => matchesCondition(event.condition, flags));
}

/**
 * その日の3択を引く。
 * シードが共通なので全員が同じ3択を見る。決定論なので
 * 「なぜこの選択肢が出たか」を後から再現できる。
 * 候補が3つに満たなければあるだけ返す。
 */
export function pickEvents(
  pool: readonly DailyEvent[],
  flags: WorldFlags,
  seed: number,
): readonly DailyEvent[] {
  return drawWithout(seed, eligibleEvents(pool, flags), OPTIONS_PER_DAY);
}
