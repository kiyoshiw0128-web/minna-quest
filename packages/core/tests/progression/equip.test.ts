import { describe, it, expect } from 'vitest';
import { equipActive, equipPassive, ACTIVE_SLOTS, PASSIVE_SLOTS } from '../../src/progression/equip.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const learned = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 1, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: learned,
    learnedPassives: ['p1', 'p2', 'p3'],
    equippedActive: [], equippedPassive: [],
    ...over,
  };
}

describe('枠数', () => {
  it('アクティブ6枠・パッシブ2枠', () => {
    expect(ACTIVE_SLOTS).toBe(6);
    expect(PASSIVE_SLOTS).toBe(2);
  });
});

describe('equipActive', () => {
  it('習得済みの技を枠数まで装備できる', () => {
    const result = equipActive(character(), ['a', 'b', 'c']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedActive).toEqual(['a', 'b', 'c']);
  });

  it('ちょうど6つまで入る', () => {
    const result = equipActive(character(), ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result.ok).toBe(true);
  });

  it('7つ目は入らない', () => {
    const result = equipActive(character(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(result).toEqual({ ok: false, reason: 'tooMany' });
  });

  it('習得していない技は装備できない', () => {
    const result = equipActive(character(), ['a', 'unknown']);
    expect(result).toEqual({ ok: false, reason: 'notLearned' });
  });

  it('同じ技を二重に装備できない', () => {
    const result = equipActive(character(), ['a', 'a']);
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('空にもできる', () => {
    const result = equipActive(character({ equippedActive: ['a'] }), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedActive).toEqual([]);
  });

  it('転職で覚えた技も、職業を問わず装備できる', () => {
    const mage = character({ currentJob: 'mage', jobs: { mage: { level: 1, exp: 0 } } });
    const result = equipActive(mage, ['a']);
    expect(result.ok).toBe(true);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    equipActive(before, ['a', 'b']);
    expect(before.equippedActive).toEqual([]);
  });
});

describe('equipPassive', () => {
  it('習得済みのパッシブを2つまで装備できる', () => {
    const result = equipPassive(character(), ['p1', 'p2']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedPassive).toEqual(['p1', 'p2']);
  });

  it('3つ目は入らない', () => {
    expect(equipPassive(character(), ['p1', 'p2', 'p3'])).toEqual({ ok: false, reason: 'tooMany' });
  });

  it('習得していないパッシブは装備できない', () => {
    expect(equipPassive(character(), ['unknown'])).toEqual({ ok: false, reason: 'notLearned' });
  });

  it('アクティブの習得一覧とは混ざらない', () => {
    expect(equipPassive(character(), ['a'])).toEqual({ ok: false, reason: 'notLearned' });
  });
});
