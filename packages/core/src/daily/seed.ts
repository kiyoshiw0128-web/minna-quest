import { hashString } from './rng.js';

/**
 * その日のイベント抽選に使うシード。
 * 世界IDと日数から決まるので、後から誰でも同じ値を再現できる。
 */
export function daySeed(worldId: string, dayNo: number): number {
  return hashString(`${worldId}:day:${dayNo}`);
}

/**
 * その日の酒場に並ぶ顔ぶれを決めるシード。
 * イベント抽選と名前空間を分けてあるのは、両者に相関が出ると
 * 「この選択肢が出た日は必ずこの職業が並ぶ」と読まれてしまうため。
 */
export function tavernSeed(worldId: string, dayNo: number): number {
  return hashString(`${worldId}:tavern:${dayNo}`);
}

/**
 * 投票が同数だったときのタイブレークに使うシード。
 * イベント抽選や酒場と名前空間を分けてあるので、
 * どの系も引き位置0から素直に引ける。
 * 「離れた添字から引く」といった申し合わせが要らず、
 * あとから別の系が高い添字を使い始めても衝突しない。
 */
export function voteSeed(worldId: string, dayNo: number): number {
  return hashString(`${worldId}:vote:${dayNo}`);
}
