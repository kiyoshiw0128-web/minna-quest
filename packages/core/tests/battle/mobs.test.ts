import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { computeStats } from '../../src/progression/stats.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { ENEMIES, BANDIT_SCOUT } from '../../src/data/enemies.js';
import type { Character } from '../../src/progression/types.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';

/** 冒険Lv・ジョブLvが同じ戦士を、そのジョブLvで習得済みの技だけで作る。 */
function warriorAtLevel(level: number): Character {
  const learnedSkills = JOBS.warrior.learnset
    .filter((entry) => entry.kind === 'skill' && entry.level <= level)
    .map((entry) => entry.id);

  return {
    id: 'warrior', name: '戦士',
    adventureLevel: level, adventureExp: 0,
    aptitude: { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' },
    currentJob: 'warrior',
    jobs: { warrior: { level, exp: 0 } },
    learnedSkills, learnedPassives: [],
    equippedActive: learnedSkills, equippedPassive: [],
  };
}

/**
 * cooldown・MPを守りながら、その時点で使える技のうちpowerが最大のものを
 * 選び続ける貪欲プラン。最適解ではないが、「素直に殴るだけでも勝てる／
 * 半分のレベルでは勝てない」という実測には十分。
 */
function greedyPlan(character: Character, maxTurns: number): string[] {
  const skillTable: Record<string, Skill> = SKILLS;
  const skills = character.equippedActive.map((id) => skillTable[id]);
  const powerOf = (skill: Skill): number =>
    skill.damage && 'power' in skill.damage ? skill.damage.power : 0;
  const priority = [...skills].sort((a, b) => powerOf(b) - powerOf(a));
  const cooldowns: Record<string, number> = {};
  let mp = computeStats(character, JOBS.warrior).maxMp;
  const plan: string[] = [];

  for (let t = 0; t < maxTurns; t++) {
    let chosen = 'slash';
    for (const skill of priority) {
      if ((cooldowns[skill.id] ?? 0) <= 0 && mp >= skill.mpCost) {
        chosen = skill.id;
        break;
      }
    }
    const skill = skillTable[chosen];
    mp -= skill.mpCost;
    if (skill.cooldown > 0) cooldowns[chosen] = skill.cooldown + 1;
    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - 1);
    plan.push(chosen);
  }
  return plan;
}

function fightAtLevel(level: number, enemy: Enemy, maxTurns = 8) {
  const character = warriorAtLevel(level);
  const member = toPartyMember(character, JOBS.warrior, SKILLS, PASSIVES);
  const plan: BattlePlan = { [member.id]: greedyPlan(character, maxTurns) };
  return simulate([member], enemy, plan, { maxTurns });
}

/**
 * 各雑魚敵に想定した「勝てるレベル」と「その半分のレベル」。
 * data/enemies.ts のコメントに書いた実測の根拠と対になっている。
 */
const TIERS: { enemyId: keyof typeof ENEMIES; level: number; half: number }[] = [
  { enemyId: 'banditScout', level: 1, half: 1 }, // Lv1が最弱値なので半分は存在しない
  { enemyId: 'forestWolf', level: 3, half: 1 },
  { enemyId: 'goblinRaider', level: 5, half: 2 },
  { enemyId: 'ogreBrute', level: 8, half: 4 },
  { enemyId: 'armoredKnight', level: 12, half: 6 },
  { enemyId: 'direWyvern', level: 18, half: 9 },
  { enemyId: 'stoneGolem', level: 21, half: 10 },
  { enemyId: 'voidWraith', level: 23, half: 11 },
];

describe('雑魚敵のバランス', () => {
  it.each(TIERS)('$enemyId は想定レベルなら8ターン以内に勝てる', ({ enemyId, level }) => {
    const log = fightAtLevel(level, ENEMIES[enemyId]);
    expect(log.result).toBe('win');
  });

  it.each(TIERS.filter((t) => t.level !== t.half))(
    '$enemyId は想定レベルの半分では勝てない',
    ({ enemyId, half }) => {
      const log = fightAtLevel(half, ENEMIES[enemyId]);
      expect(log.result).not.toBe('win');
    },
  );

  it('banditScout は、冒険Lv1・slashのみの戦士1人でも8ターン以内に勝てる', () => {
    const level1Warrior: Character = {
      id: 'warrior', name: '戦士',
      adventureLevel: 1, adventureExp: 0,
      aptitude: { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' },
      currentJob: 'warrior', jobs: { warrior: { level: 1, exp: 0 } },
      learnedSkills: ['slash'], learnedPassives: [],
      equippedActive: ['slash'], equippedPassive: [],
    };
    const stats = computeStats(level1Warrior, JOBS.warrior);
    // 仕様が明記する目安値（HP128/ATK15/DEF12/SPD10）と一致することも合わせて確認する
    expect(stats).toEqual({ maxHp: 128, maxMp: 20, atk: 15, def: 12, mat: 10, mdf: 10, spd: 10 });

    const member = toPartyMember(level1Warrior, JOBS.warrior, SKILLS, PASSIVES);
    const plan: BattlePlan = { [member.id]: Array(8).fill('slash') };
    const log = simulate([member], BANDIT_SCOUT, plan, { maxTurns: 8 });

    expect(log.result).toBe('win');
  });

  it('banditScout は、その戦士を1ターンでは倒せない（歯応えがある）', () => {
    const level1Warrior = warriorAtLevel(1);
    const member = toPartyMember(level1Warrior, JOBS.warrior, SKILLS, PASSIVES);
    const plan: BattlePlan = { [member.id]: Array(8).fill('slash') };
    const log = simulate([member], BANDIT_SCOUT, plan, { maxTurns: 1 });

    expect(log.result).not.toBe('win');
  });
});
