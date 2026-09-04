import type { PartyMember } from '../battle/state.js';
import type { Skill } from '../battle/skill.js';
import type { Effect } from '../battle/effects.js';
import { computeStats } from './stats.js';
import type { Job } from './job.js';
import type { Character, Passive } from './types.js';

export type SkillTable = Readonly<Record<string, Skill>>;
export type PassiveTable = Readonly<Record<string, Passive>>;

/**
 * 育成上のキャラを戦闘に連れて行ける形にする。
 * 育成と戦闘の唯一の接点。装備中のIDをここで実体に解決する。
 *
 * 知らないIDは黙って捨てず投げる。マスタの不整合を戦闘中まで持ち越すと
 * 「なぜか技が出ない」という形で表面化して原因が追いにくいため。
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

  return {
    id: character.id,
    name: character.name,
    stats: computeStats(character, job),
    skills: equipped,
    passives: effects,
  };
}
