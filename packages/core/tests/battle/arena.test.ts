import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { computeStats } from '../../src/progression/stats.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { ARENA_FLOORS, ARENA_FINAL_FLOOR, arenaFloor } from '../../src/data/arena.js';
import type { Character, JobId } from '../../src/progression/types.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Skill } from '../../src/battle/skill.js';

/**
 * 指定ジョブ・指定レベルのキャラを、そのジョブレベルで習得済みの技だけで作る。
 * `mobs.test.ts` の `warriorAtLevel` と同じ考え方を、ジョブを問わず使えるようにしたもの。
 */
function characterAtLevel(id: string, jobId: JobId, level: number): Character {
  const job = JOBS[jobId as keyof typeof JOBS];
  const learnedSkills = job.learnset.filter((e) => e.kind === 'skill' && e.level <= level).map((e) => e.id);
  const learnedPassives = job.learnset.filter((e) => e.kind === 'passive' && e.level <= level).map((e) => e.id);

  return {
    id, name: id,
    adventureLevel: level, adventureExp: 0,
    aptitude: { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' },
    currentJob: jobId,
    jobs: { [jobId]: { level, exp: 0 } },
    learnedSkills, learnedPassives,
    equippedActive: learnedSkills.slice(0, 6), equippedPassive: learnedPassives.slice(0, 2),
  };
}

function memberFor(character: Character): PartyMember {
  const job = JOBS[character.currentJob as keyof typeof JOBS];
  return toPartyMember(character, job, SKILLS, PASSIVES);
}

/**
 * 貪欲プラン。`mobs.test.ts` と同じ考え方(cooldown・MPを守りながらpower最大の技を
 * 選び続ける)を、パーティ全員ぶんまとめて作る。
 */
function greedyPlanFor(character: Character, maxTurns: number): (string | null)[] {
  const skills = character.equippedActive.map((id) => SKILLS[id as keyof typeof SKILLS] as Skill);
  const powerOf = (skill: Skill): number => (skill.damage && 'power' in skill.damage ? skill.damage.power : 0);
  const priority = [...skills].sort((a, b) => powerOf(b) - powerOf(a));
  const cooldowns: Record<string, number> = {};
  const job = JOBS[character.currentJob as keyof typeof JOBS];
  let mp = computeStats(character, job).maxMp;
  const plan: string[] = [];

  for (let t = 0; t < maxTurns; t++) {
    let chosen: string | null = null;
    for (const skill of priority) {
      if ((cooldowns[skill.id] ?? 0) <= 0 && mp >= skill.mpCost) { chosen = skill.id; break; }
    }
    if (chosen) {
      const skill = SKILLS[chosen as keyof typeof SKILLS] as Skill;
      mp -= skill.mpCost;
      if (skill.cooldown > 0) cooldowns[chosen] = skill.cooldown + 1;
    }
    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - 1);
    plan.push(chosen ?? skills[skills.length - 1]?.id ?? null);
  }
  return plan;
}

function greedyBattlePlan(chars: Character[], maxTurns = 8): BattlePlan {
  const plan: BattlePlan = {};
  for (const c of chars) plan[c.id] = greedyPlanFor(c, maxTurns);
  return plan;
}

type FloorCheck = {
  floor: number;
  level: number;
  jobs: JobId[];
  /** 想定解。省略すると貪欲プラン(=最大火力を撃ち続けるだけ)で判定する。 */
  plan?: (chars: Character[]) => BattlePlan;
};

/**
 * 各階を「実際に勝てるレベル・並び」で実測するための一覧。
 * data/arena.ts の各Enemyのコメントに書いた実測根拠と対になっている。
 * A/C/F型(溜め→大技・速度低下・激昂二段)は貪欲プランで足りるが、
 * B/D/E型(周期全体攻撃・高い防御・属性耐性)は狙いを持った並びが要る
 * （貪欲プランは回復・支援技のように power を持たない技をまず選ばないため）。
 */
const FLOOR_CHECKS: FloorCheck[] = [
  { floor: 1, level: 3, jobs: ['warrior'] },
  {
    floor: 2, level: 4, jobs: ['warrior', 'priest'],
    plan: ([w, p]) => ({ [w.id]: Array(8).fill('slash'), [p.id]: Array(8).fill('holyLight') }),
  },
  { floor: 3, level: 5, jobs: ['thief'] },
  {
    floor: 4, level: 6, jobs: ['thief'],
    plan: ([t]) => ({ [t.id]: Array(8).fill('poisonDagger') }),
  },
  {
    floor: 5, level: 8, jobs: ['mage'],
    plan: ([m]) => ({ [m.id]: Array(8).fill('thunderBolt') }),
  },
  {
    floor: 6, level: 10, jobs: ['warrior', 'priest'],
    plan: ([w, p]) => ({ [w.id]: Array(8).fill('slash'), [p.id]: Array(8).fill('holyLight') }),
  },
  { floor: 7, level: 12, jobs: ['warrior', 'monk'] },
  {
    floor: 8, level: 14, jobs: ['priest', 'warrior'],
    plan: ([p, w]) => ({ [p.id]: Array(8).fill('holyLight'), [w.id]: Array(8).fill('slash') }),
  },
  { floor: 9, level: 16, jobs: ['thief', 'ranger'] },
  {
    floor: 10, level: 18, jobs: ['thief', 'warrior'],
    plan: ([t, w]) => ({ [t.id]: Array(8).fill('armorBreak'), [w.id]: Array(8).fill('slash') }),
  },
  {
    floor: 11, level: 19, jobs: ['mage', 'priest'],
    plan: ([m, p]) => ({ [m.id]: Array(8).fill('iceCoffin'), [p.id]: Array(8).fill('holyLight') }),
  },
  { floor: 12, level: 20, jobs: ['warrior', 'mage'] },
  { floor: 13, level: 22, jobs: ['paladin', 'warrior', 'priest'] },
  {
    floor: 14, level: 24, jobs: ['priest', 'paladin', 'mage'],
    plan: ([p, pal, m]) => ({
      [p.id]: Array(8).fill('groupHeal'), [pal.id]: Array(8).fill('shieldSmash'), [m.id]: Array(8).fill('iceCoffin'),
    }),
  },
  { floor: 15, level: 26, jobs: ['thief', 'ranger', 'monk'] },
  {
    floor: 16, level: 28, jobs: ['paladin', 'thief', 'ranger'],
    plan: ([pal, t, r]) => ({
      [pal.id]: Array(8).fill('judgmentShield'), [t.id]: Array(8).fill('armorBreak'), [r.id]: Array(8).fill('vitalShot'),
    }),
  },
  {
    floor: 17, level: 30, jobs: ['mage', 'sage', 'priest'],
    plan: ([m, s, p]) => ({
      [m.id]: Array(8).fill('thunderBolt'), [s.id]: Array(8).fill('holyLight'), [p.id]: Array(8).fill('sacredFlame'),
    }),
  },
  { floor: 18, level: 32, jobs: ['spellblade', 'warrior', 'priest'] },
  { floor: 19, level: 35, jobs: ['sage', 'paladin', 'monk'] },
];

function fightFloor(check: FloorCheck, level = check.level, maxTurns = 8) {
  const enemy = arenaFloor(check.floor)!.enemy;
  const chars = check.jobs.map((jobId, i) => characterAtLevel(`${jobId}${i}`, jobId, level));
  const members = chars.map(memberFor);
  const plan = check.plan ? check.plan(chars) : greedyBattlePlan(chars, maxTurns);
  return simulate(members, enemy, plan, { maxTurns });
}

describe('闘技場: 各階のバランス(実測)', () => {
  it.each(FLOOR_CHECKS)('$floor 階は想定レベル・想定パーティで8ターン以内に勝てる', (check) => {
    const log = fightFloor(check);
    expect(log.result).toBe('win');
  });

  it.each(FLOOR_CHECKS)('$floor 階は想定レベルの半分では勝てない', (check) => {
    const half = Math.floor(check.level / 2);
    const log = fightFloor(check, half);
    expect(log.result).not.toBe('win');
  });
});

describe('闘技場: 隣り合う階が同じ問いにならないこと(設計書§8-8)', () => {
  it('隣り合う階の行動表(通常時)が同一でない', () => {
    for (let i = 1; i < ARENA_FLOORS.length; i++) {
      const prev = ARENA_FLOORS[i - 1].enemy.pattern.map((p) => p.skillId);
      const curr = ARENA_FLOORS[i].enemy.pattern.map((p) => p.skillId);
      expect(curr, `${ARENA_FLOORS[i - 1].floor}階と${ARENA_FLOORS[i].floor}階の行動表が同一`).not.toEqual(prev);
    }
  });

  it('全20階ぶんの敵が定義されている', () => {
    expect(ARENA_FLOORS).toHaveLength(20);
    expect(ARENA_FLOORS.map((f) => f.floor)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('敵のIDに重複が無い(使い回しの検出)', () => {
    const ids = ARENA_FLOORS.map((f) => f.enemy.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * 裏ボス(20階)の検査。設計書§8-6「裏ボスは素朴な並びでは勝てない」の実測。
 *
 * 「素朴な並び」は greedyBattlePlan、すなわち「使える中でpowerが最大の技を
 * 機械的に撃ち続けるだけ」のプラン。守りの詠唱のような支援技はpower値を
 * 持たないため、この並びでは一度も選ばれない。
 */
describe('闘技場: 裏ボス(20階)', () => {
  const level = 45;
  const jobs: JobId[] = ['paladin', 'spellblade', 'sage', 'priest'];

  function bossChars(): Character[] {
    return jobs.map((jobId, i) => characterAtLevel(`${jobId}${i}`, jobId, level));
  }

  /**
   * 想定解。僧侶が1・5ターン目に守りの詠唱(MDF+50%、3ターン)を挟み、
   * 3ターンごとに来る終焉の波動(4・8ターン目)の被害を耐えられる水準まで
   * 下げておく。他の全ターン・全員は使える中で最大火力の技を撃つ。
   */
  function intendedPlan(chars: Character[]): BattlePlan {
    const [pal, sb, sg, pr] = chars;
    return {
      [pal.id]: ['judgmentShield', 'shieldSmash', 'judgmentShield', 'shieldSmash', 'judgmentShield', 'shieldSmash', 'judgmentShield', 'shieldSmash'],
      [sb.id]: greedyPlanFor(sb, 8),
      [sg.id]: greedyPlanFor(sg, 8),
      [pr.id]: ['guardChant', 'sacredFlame', 'sacredFlame', 'sacredFlame', 'guardChant', 'sacredFlame', 'sacredFlame', 'sacredFlame'],
    };
  }

  it('裏ボスはARENA_FINAL_FLOOR(20階)に定義されている', () => {
    expect(ARENA_FINAL_FLOOR).toBe(20);
    expect(arenaFloor(20)?.enemy.id).toBe('arenaAbyssalSovereign');
  });

  it('行動表は通常・激昂の二段構えである', () => {
    const enemy = arenaFloor(20)!.enemy;
    expect(enemy.enrage).toBeDefined();
    expect(enemy.pattern.map((p) => p.skillId)).not.toEqual(enemy.enrage!.pattern.map((p) => p.skillId));
  });

  it('素朴な並び(一番強い技を撃ち続ける)では勝てない', () => {
    const chars = bossChars();
    const members = chars.map(memberFor);
    const log = simulate(members, arenaFloor(20)!.enemy, greedyBattlePlan(chars, 8), { maxTurns: 8 });
    expect(log.result).not.toBe('win');
  });

  it('想定解(溜めの窓を守りの詠唱で耐える)なら8ターン以内に勝てる', () => {
    const chars = bossChars();
    const members = chars.map(memberFor);
    const log = simulate(members, arenaFloor(20)!.enemy, intendedPlan(chars), { maxTurns: 8 });
    expect(log.result).toBe('win');
  });

  it('素朴な並びは、守りを整えなかった仲間を終焉の波動で失う', () => {
    const chars = bossChars();
    const members = chars.map(memberFor);
    const log = simulate(members, arenaFloor(20)!.enemy, greedyBattlePlan(chars, 8), { maxTurns: 8 });
    expect(log.events.some((e) => e.t === 'down')).toBe(true);
  });

  it('想定解では誰も落ちない', () => {
    const chars = bossChars();
    const members = chars.map(memberFor);
    const log = simulate(members, arenaFloor(20)!.enemy, intendedPlan(chars), { maxTurns: 8 });
    expect(log.events.some((e) => e.t === 'down' && e.actorId !== 'arenaAbyssalSovereign')).toBe(false);
  });
});
