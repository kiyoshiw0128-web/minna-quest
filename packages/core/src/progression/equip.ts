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
