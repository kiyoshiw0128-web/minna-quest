import { describe, it, expect } from 'vitest';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { computeStats } from '../../src/progression/stats.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'hero', name: '主人公',
    adventureLevel: 12, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 8, exp: 0 } },
    learnedSkills: ['slash', 'provoke', 'armorBreak'],
    learnedPassives: ['ironSkin'],
    equippedActive: ['slash', 'armorBreak'],
    equippedPassive: ['ironSkin'],
    ...over,
  };
}

describe('toPartyMember', () => {
  it('IDと名前をそのまま引き継ぐ', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.id).toBe('hero');
    expect(member.name).toBe('主人公');
  });

  it('computeStats と同じステータスを載せる', () => {
    const c = character();
    const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.stats).toEqual(computeStats(c, JOBS.warrior));
  });

  it('装備中のアクティブだけを技として渡す', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills.map((skill) => skill.id)).toEqual(['slash', 'armorBreak']);
  });

  it('習得済みでも装備していない技は渡さない', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills.map((skill) => skill.id)).not.toContain('provoke');
  });

  it('装備中のパッシブを効果に変えて渡す', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.passives).toEqual([PASSIVES.ironSkin.effect]);
  });

  it('何も装備していなければ空で渡す', () => {
    const bare = character({ equippedActive: [], equippedPassive: [] });
    const member = toPartyMember(bare, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills).toEqual([]);
    expect(member.passives).toEqual([]);
  });

  it('マスタに無い技を装備していたら落とす', () => {
    const broken = character({ learnedSkills: ['ghost'], equippedActive: ['ghost'] });
    expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown skill: ghost');
  });

  it('マスタに無いパッシブを装備していたら落とす', () => {
    const broken = character({ learnedPassives: ['ghost'], equippedPassive: ['ghost'] });
    expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown passive: ghost');
  });
});
