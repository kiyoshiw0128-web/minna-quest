import { describe, it, expect } from 'vitest';
import { gainExp } from '../../src/progression/exp.js';
import { changeJob, isUnlocked, createCharacter } from '../../src/progression/unlock.js';
import { equipActive, equipPassive } from '../../src/progression/equip.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { computeStats } from '../../src/progression/stats.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { simulate } from '../../src/battle/simulate.js';
import type { Character, Aptitude } from '../../src/progression/types.js';
import type { Enemy } from '../../src/battle/enemy.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function fresh(): Character {
  return createCharacter({ id: 'hero', name: '主人公', aptitude: flat, job: 'warrior' }, JOBS);
}

/** ジョブレベルを目標まで上げる。冒険レベルは動かさない。 */
function trainJob(character: Character, target: number): Character {
  let current = character;
  while ((current.jobs[current.currentJob]?.level ?? 1) < target) {
    current = gainExp(current, { adventure: 0, job: 5000 }, JOBS).character;
  }
  return current;
}

describe('育成の通し', () => {
  it('作った直後から初期職の技を持っている', () => {
    const hero = fresh();
    expect(hero.learnedSkills).toContain('slash');
    expect(hero.equippedActive).toContain('slash');
  });

  it('戦士を育てるとジョブレベルで技を覚える', () => {
    const trained = trainJob(fresh(), 12);
    expect(trained.learnedSkills).toContain('slash');
    expect(trained.learnedSkills).toContain('provoke');
    expect(trained.learnedSkills).toContain('heavyBlow');
  });

  it('転職しても冒険レベルと習得済みは失われない', () => {
    const trained = gainExp(trainJob(fresh(), 12), { adventure: 100000, job: 0 }, JOBS).character;
    const level = trained.adventureLevel;
    const changed = changeJob(trained, 'priest', JOBS);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.character.adventureLevel).toBe(level);
    expect(changed.character.learnedSkills).toContain('heavyBlow');
    expect(changed.character.jobs['priest']).toEqual({ level: 1, exp: 0 });
  });

  it('2つの職業を育てると上級職が解禁される', () => {
    let hero = trainJob(fresh(), 20);
    expect(isUnlocked(hero, JOBS.paladin)).toBe(false);

    const toPriest = changeJob(hero, 'priest', JOBS);
    expect(toPriest.ok).toBe(true);
    if (!toPriest.ok) return;
    hero = trainJob(toPriest.character, 15);

    expect(isUnlocked(hero, JOBS.paladin)).toBe(true);

    const toPaladin = changeJob(hero, 'paladin', JOBS);
    expect(toPaladin.ok).toBe(true);
    if (!toPaladin.ok) return;
    expect(toPaladin.character.currentJob).toBe('paladin');
  });

  it('上級職に就くとステータスが上がる', () => {
    let hero = trainJob(fresh(), 20);
    const asWarrior = computeStats(hero, JOBS.warrior);

    const toPriest = changeJob(hero, 'priest', JOBS);
    if (!toPriest.ok) return;
    hero = trainJob(toPriest.character, 15);
    const toPaladin = changeJob(hero, 'paladin', JOBS);
    if (!toPaladin.ok) return;
    const trained = trainJob(toPaladin.character, 20);

    const asPaladin = computeStats(trained, JOBS.paladin);
    expect(asPaladin.def).toBeGreaterThan(asWarrior.def);
  });

  it('育てた結果がそのまま戦闘の強さになる', () => {
    const dummy: Enemy = {
      id: 'dummy', name: '木人',
      stats: { maxHp: 3000, maxMp: 0, atk: 1, def: 40, mat: 1, mdf: 40, spd: 1 },
      skills: [SKILLS.slash],
      pattern: [{ skillId: 'slash' }],
    };

    // createCharacter が装備済みでも、比較を「slash 1本」に揃えるため付け直す
    function damageDealt(character: Character): number {
      const equippedActive = equipActive(character, ['slash']);
      if (!equippedActive.ok) throw new Error('equip failed');
      const member = toPartyMember(equippedActive.character, JOBS.warrior, SKILLS, PASSIVES);
      const log = simulate([member], dummy, { hero: ['slash'] }, { maxTurns: 1 });
      const hit = log.events.find((event) => event.t === 'damage');
      if (!hit || hit.t !== 'damage') throw new Error('no damage event');
      return hit.amount;
    }

    const rookie = trainJob(fresh(), 1);
    const veteran = gainExp(trainJob(fresh(), 20), { adventure: 200000, job: 0 }, JOBS).character;

    expect(damageDealt(veteran)).toBeGreaterThan(damageDealt(rookie));
  });

  it('パッシブを装備すると戦闘に効く', () => {
    const trained = trainJob(fresh(), 16);
    const withSkill = equipActive(trained, ['slash']);
    if (!withSkill.ok) return;
    const withPassive = equipPassive(withSkill.character, ['ironSkin']);
    expect(withPassive.ok).toBe(true);
    if (!withPassive.ok) return;

    const member = toPartyMember(withPassive.character, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.passives).toEqual([PASSIVES.ironSkin.effect]);
  });
});
