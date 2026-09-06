import { describe, it, expect } from 'vitest';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { WEAPONS, ARMORS } from '../../src/data/equipment.js';
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

  // 設計書 §8 テスト1（最重要）。装備という概念が無かった頃のCharacterを
  // そのまま渡しても、結果が computeStats と完全に一致すること。
  describe('装備（設計書 §4・§8 テスト1・テスト2）', () => {
    it('equippedWeapon/equippedArmorが無ければ、装備という概念が無かった頃と完全に一致する', () => {
      const c = character();
      const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
      expect(member.stats).toEqual(computeStats(c, JOBS.warrior));
    });

    it('equippedWeapon/equippedArmorがnullでも同様に一致する', () => {
      const c = character({ equippedWeapon: null, equippedArmor: null });
      const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
      expect(member.stats).toEqual(computeStats(c, JOBS.warrior));
    });

    it('武器を装備すると、その分だけステータスが上がる', () => {
      const c = character({ equippedWeapon: 'steelBlade', equippedArmor: null });
      const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
      const base = computeStats(c, JOBS.warrior);
      expect(member.stats.atk).toBe(base.atk + WEAPONS.steelBlade.mods.atk!);
      expect(member.stats.spd).toBe(base.spd + WEAPONS.steelBlade.mods.spd!);
    });

    it('防具を装備すると、その分だけステータスが上がる', () => {
      const c = character({ equippedWeapon: null, equippedArmor: 'ironMail' });
      const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
      const base = computeStats(c, JOBS.warrior);
      expect(member.stats.def).toBe(base.def + ARMORS.ironMail.mods.def!);
      expect(member.stats.maxHp).toBe(base.maxHp + ARMORS.ironMail.mods.maxHp!);
    });

    it('マスタに無い武器IDを装備していたら落とす', () => {
      const broken = character({ equippedWeapon: 'ghostSword' });
      expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown weapon: ghostSword');
    });

    it('マスタに無い防具IDを装備していたら落とす', () => {
      const broken = character({ equippedArmor: 'ghostArmor' });
      expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown armor: ghostArmor');
    });
  });
});
