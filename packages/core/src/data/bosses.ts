import { BALGOS, GOUZA, VORNIL } from './enemies.js';
import type { Enemy } from '../battle/enemy.js';

/**
 * 章ごとのボス。7日ごとのボスの日に、その日の選択肢を上書きして出る。
 *
 * **章が増えたらここに足す。** 定義が無い章はボスの日でも通常のイベントで進む。
 * 存在しない章のために適当なボスを流用すると、難易度も物語も合わないものが
 * 出てくるので、無いときは無いまま通す。
 *
 * 第1章＝バルゴス（7日目）、第2章＝ゴウザ（14日目）、第3章＝ヴォルニル
 * （21日目、MAX_CHAPTERが頭打ちにする今のところ最後の章なので、以後28日目・
 * 35日目…も同じヴォルニルが出続ける）。3章とも数値・行動表の実測は
 * `tests/battle/boss.test.ts`（第1章）と `tests/battle/bosses2and3.test.ts`
 * （第2・3章）にある。
 */
export const CHAPTER_BOSSES: Readonly<Record<number, Enemy>> = {
  1: BALGOS,
  2: GOUZA,
  3: VORNIL,
};

/** その章のボス。定義が無ければ null。 */
export function bossForChapter(chapter: number): Enemy | null {
  return CHAPTER_BOSSES[chapter] ?? null;
}
