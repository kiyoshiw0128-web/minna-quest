import type { Equipment, EquipmentSlot } from '../data/equipment.js';
import type { Character } from './types.js';

/** 戦闘に持ち込めるアクティブ技の枠数。 */
export const ACTIVE_SLOTS = 6;

/** 戦闘に持ち込めるパッシブの枠数。 */
export const PASSIVE_SLOTS = 2;

export type EquipError = 'notLearned' | 'tooMany' | 'duplicate';

type EquipResult =
  | { ok: true; character: Character }
  | { ok: false; reason: EquipError };

export function equipActive(
  character: Character,
  skillIds: readonly string[],
): EquipResult {
  const error = validate(skillIds, character.learnedSkills, ACTIVE_SLOTS);
  if (error) return { ok: false, reason: error };
  return { ok: true, character: { ...character, equippedActive: [...skillIds] } };
}

export function equipPassive(
  character: Character,
  passiveIds: readonly string[],
): EquipResult {
  const error = validate(passiveIds, character.learnedPassives, PASSIVE_SLOTS);
  if (error) return { ok: false, reason: error };
  return { ok: true, character: { ...character, equippedPassive: [...passiveIds] } };
}

function validate(
  chosen: readonly string[],
  learned: readonly string[],
  slots: number,
): EquipError | null {
  if (chosen.length > slots) return 'tooMany';
  if (new Set(chosen).size !== chosen.length) return 'duplicate';
  if (chosen.some((id) => !learned.includes(id))) return 'notLearned';
  return null;
}

export type EquipItemError = 'unknownItem' | 'wrongSlot';

type EquipItemResult =
  | { ok: true; character: Character }
  | { ok: false; reason: EquipItemError };

/**
 * 武器・防具の枠を入れ替える（設計書 §6 `POST /api/equip-item`）。
 *
 * ここで見るのは「そのIDが存在するか」「スロットが合っているか」だけ。
 * 「持っているか」「所持数を超えて複数人に付けていないか」は1キャラの
 * 情報だけでは判定できず、プレイヤー全体のplayer_items／他キャラの装備状況を
 * 見る必要があるため、サーバ側（apps/worker/src/store.ts）のSQLで守る
 * （equipActive/equipPassive が「習得済みか」までしか見ないのと同じ役割分担）。
 */
export function equipItem(
  character: Character,
  weaponId: string | null,
  armorId: string | null,
  equipment: Readonly<Record<string, Equipment>>,
): EquipItemResult {
  const weaponCheck = checkSlot(weaponId, equipment, 'weapon');
  if (weaponCheck !== null) return { ok: false, reason: weaponCheck };

  const armorCheck = checkSlot(armorId, equipment, 'armor');
  if (armorCheck !== null) return { ok: false, reason: armorCheck };

  return { ok: true, character: { ...character, equippedWeapon: weaponId, equippedArmor: armorId } };
}

function checkSlot(
  id: string | null,
  equipment: Readonly<Record<string, Equipment>>,
  slot: EquipmentSlot,
): EquipItemError | null {
  if (id === null) return null;
  const item = equipment[id];
  if (!item) return 'unknownItem';
  if (item.slot !== slot) return 'wrongSlot';
  return null;
}
