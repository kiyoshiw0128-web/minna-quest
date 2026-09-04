import { hashString } from './rng.js';

/**
 * その日のイベント抽選と、投票が同数だったときのタイブレークに使うシード。
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
