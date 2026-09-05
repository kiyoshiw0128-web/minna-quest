import { BALGOS } from './enemies.js';
import type { Enemy } from '../battle/enemy.js';

/**
 * 章ごとのボス。7日ごとのボスの日に、その日の選択肢を上書きして出る。
 *
 * **章が増えたらここに足す。** 定義が無い章はボスの日でも通常のイベントで進む。
 * 存在しない章のために適当なボスを流用すると、難易度も物語も合わないものが
 * 出てくるので、無いときは無いまま通す。
 *
 * いまは第1章のバルゴスだけ。第2章以降のボスは未作成で、
 * その章のボスの日は投票で決まった通常のイベントがそのまま起きる。
 */
export const CHAPTER_BOSSES: Readonly<Record<number, Enemy>> = {
  1: BALGOS,
};

/** その章のボス。定義が無ければ null。 */
export function bossForChapter(chapter: number): Enemy | null {
  return CHAPTER_BOSSES[chapter] ?? null;
}
