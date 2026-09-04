import { tallyVotes } from './vote.js';
import type { Vote } from './vote.js';

/** 章ボスが来る間隔。 */
export const BOSS_INTERVAL = 7;

/** 7日ごとが章ボスの日。 */
export function isBossDay(dayNo: number): boolean {
  return dayNo > 0 && dayNo % BOSS_INTERVAL === 0;
}

/** その日が属する章。1日目から7日目までが第1章。 */
export function chapterOf(dayNo: number): number {
  return Math.floor((dayNo - 1) / BOSS_INTERVAL) + 1;
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
