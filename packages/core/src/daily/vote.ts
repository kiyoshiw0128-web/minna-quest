import { intAt } from './rng.js';

export type Vote = {
  readonly playerId: string;
  readonly optionId: string;
};

export type Tally = {
  readonly winner: string;
  readonly counts: Readonly<Record<string, number>>;
  /** 同数だったためシードで決めた場合に true */
  readonly tiebroken: boolean;
};

/**
 * 投票を集計して、その日に通る選択肢を決める。
 *
 * - 同じプレイヤーが複数回投票していたら、最後の1票だけを数える
 * - 提示されていない選択肢への票は無視する
 * - 同数ならシードで決める。サイコロを振らないので後から検証できる
 * - シードは voteSeed（投票専用の名前空間）を渡すこと。イベント抽選と
 *   同じシードを渡すと、両者の結果が裏で結びついてしまう
 * - 誰も投票しなければ全選択肢が0票で並び、そのままタイブレークに落ちる
 */
export function tallyVotes(
  votes: readonly Vote[],
  options: readonly string[],
  seed: number,
): Tally {
  if (options.length === 0) throw new Error('no options to tally');

  const latest = new Map<string, string>();
  for (const vote of votes) {
    if (options.includes(vote.optionId)) latest.set(vote.playerId, vote.optionId);
  }

  const counts: Record<string, number> = {};
  for (const option of options) counts[option] = 0;
  for (const optionId of latest.values()) counts[optionId] += 1;

  const top = Math.max(...options.map((option) => counts[option]));
  const leaders = options.filter((option) => counts[option] === top);
  const tiebroken = leaders.length > 1;

  return {
    winner: tiebroken ? leaders[intAt(seed, 0, leaders.length)] : leaders[0],
    counts,
    tiebroken,
  };
}
