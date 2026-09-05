import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { computeStats } from '../../src/progression/stats.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { ENEMIES, BANDIT_SCOUT } from '../../src/data/enemies.js';
import { EVENTS } from '../../src/data/events.js';
import type { DailyEvent } from '../../src/daily/event.js';
import { BOSS_INTERVAL } from '../../src/daily/day.js';
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

/**
 * 敵の必要レベルと、その敵が出る章が噛み合っているかの検査。
 *
 * 経験値は戦闘に勝ってしか入らず1日1戦なので、レベルはおおよそ日数に比例する。
 * 章は7日で1つ進むので、第N章の頭で 7×(N-1) 戦ぶんが上限になる。
 * 1戦につき冒険レベルが1上がるとは限らないが、**上限として** この本数を超える
 * レベルを要求する敵は、その章では絶対に勝てない。
 *
 * これを検査するのは、実際に噛み合っていない状態を作ってしまったため。
 * 雑魚敵を足した直後、必要Lv8の人喰い鬼が第1章（最大7戦）に出る条件になっていて、
 * 必要Lv23の敵が第2章に出る条件になっていた。個々の敵の強さの検査は通るので、
 * イベント側の条件と突き合わせないと見つからない。
 */
describe('敵の強さと出現する章の噛み合い', () => {
  /**
   * 第N章が終わるまでに戦える最大本数。1日1戦、7日で1章。
   *
   * 章の頭ではなく終わりで測るのは、その敵が「その章のあいだに一度でも
   * 勝てるか」を見たいため。章の頭で測ると、第1章にはLv1の敵しか置けなくなり、
   * 章の中で少しずつ強い相手が出てくる形を作れない。
   * 負けても失うものは無く、過去の日は後から挑み直せるので、
   * 章の途中で一度負けること自体は問題にならない。
   */
  function maxFightsWithin(chapter: number): number {
    return chapter * BOSS_INTERVAL - 1;
  }

  it('どの戦闘イベントも、その章までに届きうるレベルの敵を指している', () => {
    const requiredLevel = new Map(TIERS.map((tier) => [tier.enemyId as string, tier.level]));
    const tooStrong: string[] = [];

    // マスタは as const なので、型としては各エントリの形が個別に狭まる。
    // ここは「どのイベントも」を横断で見たいので、共通の形に均してから回す。
    const events: readonly DailyEvent[] = Object.values(EVENTS);

    for (const event of events) {
      if (event.kind !== 'battle' || event.enemyId === undefined) continue;

      const level = requiredLevel.get(event.enemyId);
      // 章ボス（balgos）は TIERS に無い。1体だけ別枠で用意されており、
      // 雑魚の段階表には乗らないので、ここでは対象外にする。
      if (level === undefined) continue;

      const chapter = event.condition.minChapter ?? 1;
      // レベル1から始まるので、N戦で届く上限は Lv(N+1)。
      const reachable = maxFightsWithin(chapter) + 1;
      if ((level as number) > reachable) {
        tooStrong.push(`${event.id}: 必要Lv${level} > 第${chapter}章までに届くLv${reachable}`);
      }
    }

    expect(tooStrong).toEqual([]);
  });
});
