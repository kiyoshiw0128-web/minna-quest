import type { PartyMember } from '../battle/state.js';
import type { Skill } from '../battle/skill.js';
import type { Effect } from '../battle/effects.js';
import { EQUIPMENT, applyEquipment } from '../data/equipment.js';
import type { Equipment } from '../data/equipment.js';
import { computeStats } from './stats.js';
import type { Job } from './job.js';
import type { Character, Passive } from './types.js';

export type SkillTable = Readonly<Record<string, Skill>>;
export type PassiveTable = Readonly<Record<string, Passive>>;

/**
 * 装備IDを実体に解決する。マスタは pets.ts と同じやり方でここが直接
 * 参照する（activePetEffects が PETS を直接 import するのと同じ考え方。
 * skills/passives のようにテーブルを引数で受けないのは、装備はキャラ単体の
 * 属性であって呼び出し側が差し替える理由が無いため）。
 *
 * 未装備（null/undefined）は null。マスタに無いIDは、技・パッシブと同じく
 * 黙って落とさず投げる（設計書 §8 テスト1 — 装備なしの結果が変わらないことは
 * ここで確実に保証される。undefined を渡す既存の全テストは EQUIPMENT を
 * 一切引かないまま null が返る）。
 */
function resolveEquipment(id: string | null | undefined, label: 'weapon' | 'armor'): Equipment | null {
  if (id === null || id === undefined) return null;
  const item = EQUIPMENT[id];
  if (!item) throw new Error(`unknown ${label}: ${id}`);
  return item;
}

/**
 * 育成上のキャラを戦闘に連れて行ける形にする。
 * 育成と戦闘の唯一の接点。装備中のIDをここで実体に解決する。
 *
 * 知らないIDは黙って捨てず投げる。マスタの不整合を戦闘中まで持ち越すと
 * 「なぜか技が出ない」という形で表面化して原因が追いにくいため。
 *
 * 装備の反映もここで行う（computeStats には混ぜない。設計書 §4 —
 * 装備を持たない呼び出し（既存のテスト、闘技場の調整用スクリプト）を
 * シグネチャ変更に巻き込まないため）。
 */
export function toPartyMember(
  character: Character,
  job: Job,
  skills: SkillTable,
  passives: PassiveTable,
): PartyMember {
  const equipped: Skill[] = character.equippedActive.map((id) => {
    const skill = skills[id];
    if (!skill) throw new Error(`unknown skill: ${id}`);
    return skill;
  });

  const effects: Effect[] = character.equippedPassive.map((id) => {
    const passive = passives[id];
    if (!passive) throw new Error(`unknown passive: ${id}`);
    return passive.effect;
  });

  const weapon = resolveEquipment(character.equippedWeapon, 'weapon');
  const armor = resolveEquipment(character.equippedArmor, 'armor');

  return {
    id: character.id,
    name: character.name,
    stats: applyEquipment(computeStats(character, job), weapon, armor),
    skills: equipped,
    passives: effects,
  };
}
