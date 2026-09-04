import { describe, it, expect } from 'vitest';
import { aptitudeMultiplier } from '../../src/progression/aptitude.js';

describe('aptitudeMultiplier', () => {
  it('C を基準の 1.0 とする', () => {
    expect(aptitudeMultiplier('C')).toBe(1.0);
  });

  it('等級が上がるほど伸びが大きい', () => {
    expect(aptitudeMultiplier('A')).toBeGreaterThan(aptitudeMultiplier('B'));
    expect(aptitudeMultiplier('B')).toBeGreaterThan(aptitudeMultiplier('C'));
  });

  it('等級が下がるほど伸びが小さい', () => {
    expect(aptitudeMultiplier('C')).toBeGreaterThan(aptitudeMultiplier('D'));
    expect(aptitudeMultiplier('D')).toBeGreaterThan(aptitudeMultiplier('E'));
  });

  it('最低でも伸びが止まりはしない', () => {
    expect(aptitudeMultiplier('E')).toBeGreaterThan(0);
  });

  it('具体的な倍率を固定する', () => {
    expect(aptitudeMultiplier('A')).toBe(1.3);
    expect(aptitudeMultiplier('E')).toBe(0.7);
  });
});
