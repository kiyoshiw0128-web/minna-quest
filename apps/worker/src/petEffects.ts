import { PETS } from '@mq/core';
import type { Effect } from '@mq/core';

/**
 * 連れているペットの効果を、`simulate` に渡す初期効果の配列にする。
 *
 * 連れていなければ空配列（設計書 §6 —「受け取らない場合の挙動は今と同じにする」）。
 * battle.ts と arena.ts の両方から呼ぶ（本編の戦闘と闘技場の両方に同じように効かせる）。
 */
export function activePetEffects(activePetId: string | null): readonly Effect[] {
  if (activePetId === null) return [];
  const pet = PETS[activePetId as keyof typeof PETS] as { effect: Effect } | undefined;
  return pet === undefined ? [] : [pet.effect];
}
