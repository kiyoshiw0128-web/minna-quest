import { describe, it, expect } from 'vitest';
import { daySeed, tavernSeed, voteSeed } from '../../src/daily/seed.js';

describe('daySeed', () => {
  it('同じ世界の同じ日からは常に同じシードが出る', () => {
    expect(daySeed('world-1', 5)).toBe(daySeed('world-1', 5));
  });

  it('日が違えばシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(daySeed('world-1', 6));
  });

  it('世界が違えばシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(daySeed('world-2', 5));
  });
});

describe('tavernSeed', () => {
  it('同じ世界の同じ日からは常に同じシードが出る', () => {
    expect(tavernSeed('world-1', 5)).toBe(tavernSeed('world-1', 5));
  });

  it('日が違えばシードが違う', () => {
    expect(tavernSeed('world-1', 5)).not.toBe(tavernSeed('world-1', 6));
  });
});

describe('voteSeed', () => {
  it('同じ世界の同じ日からは常に同じシードが出る', () => {
    expect(voteSeed('world-1', 5)).toBe(voteSeed('world-1', 5));
  });

  it('日が違えばシードが違う', () => {
    expect(voteSeed('world-1', 5)).not.toBe(voteSeed('world-1', 6));
  });

  it('世界が違えばシードが違う', () => {
    expect(voteSeed('world-1', 5)).not.toBe(voteSeed('world-2', 5));
  });
});

describe('名前空間の分離', () => {
  it('同じ世界・同じ日でも、イベント用と酒場用と投票用でシードが違う', () => {
    const seeds = [daySeed('world-1', 5), tavernSeed('world-1', 5), voteSeed('world-1', 5)];
    expect(new Set(seeds).size).toBe(3);
  });

  it('どの日でも三者が一致しない', () => {
    for (let dayNo = 1; dayNo <= 50; dayNo++) {
      const seeds = [
        daySeed('world-1', dayNo),
        tavernSeed('world-1', dayNo),
        voteSeed('world-1', dayNo),
      ];
      expect(new Set(seeds).size).toBe(3);
    }
  });
});
