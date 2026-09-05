import { tallyVotes } from './vote.js';
import type { Vote } from './vote.js';

/** 章ボスが来る間隔。 */
export const BOSS_INTERVAL = 7;

/** 7日ごとが章ボスの日。 */
export function isBossDay(dayNo: number): boolean {
  return dayNo > 0 && dayNo % BOSS_INTERVAL === 0;
}

/**
 * いま用意してある最後の章。
 *
 * ここで頭打ちにするのは、第4章以降の中身（イベント・ボス）がまだ無いため。
 * 章だけ進めると、条件を満たすイベントが尽きて同じ3択が並び続けるか、
 * 存在しない章のボスを探しに行くことになる。中身を足したらこの数を上げる。
 *
 * **世界は止まらない。** 日数は進み続け、第3章のまま冒険は続く。
 * 終わりを作らない設計なので（闘技場が区切りを担う）、これは「打ち切り」ではなく
 * 「今のところ第3章まで」という意味である。
 */
export const MAX_CHAPTER = 3;

/**
 * その日が属する章。1日目から7日目までが第1章。
 * 用意してある最後の章で頭打ちになる。
 */
export function chapterOf(dayNo: number): number {
  return Math.min(MAX_CHAPTER, Math.floor((dayNo - 1) / BOSS_INTERVAL) + 1);
}

export type WorldDay = {
  readonly dayNo: number;
  /** その日に提示された選択肢 */
  readonly optionIds: readonly string[];
  /** 締め済みなら確定した選択肢。未締めなら null */
  readonly chosenId: string | null;
  /** 締め済みなら選択肢ごとの票数。未締めなら null */
  readonly counts: Readonly<Record<string, number>> | null;
  /** 締め済みで、同数だったためシードで決めた場合に true。未締めなら null */
  readonly tiebroken: boolean | null;
};

/**
 * その日を締める。
 *
 * **冪等。** 締め処理が失敗して二重に呼ばれても結果が変わらないことが必須で、
 * すでに締まっている日は手を触れずにそのまま返す。あとから票が増えても
 * 確定した選択肢は動かない。
 */
export function closeDay(day: WorldDay, votes: readonly Vote[], seed: number): WorldDay {
  if (day.chosenId !== null) return day;

  const tally = tallyVotes(votes, day.optionIds, seed);
  return { ...day, chosenId: tally.winner, counts: tally.counts, tiebroken: tally.tiebroken };
}
