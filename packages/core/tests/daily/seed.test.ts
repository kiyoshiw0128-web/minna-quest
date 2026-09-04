import { describe, it, expect } from 'vitest';
import { daySeed, tavernSeed } from '../../src/daily/seed.js';

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

describe('名前空間の分離', () => {
  it('同じ世界・同じ日でも、イベント用と酒場用でシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(tavernSeed('world-1', 5));
  });

  it('どの日でも両者が一致しない', () => {
    for (let dayNo = 1; dayNo <= 50; dayNo++) {
      expect(daySeed('world-1', dayNo)).not.toBe(tavernSeed('world-1', dayNo));
    }
  });
});
