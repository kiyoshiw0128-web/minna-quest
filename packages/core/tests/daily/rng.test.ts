import { describe, it, expect } from 'vitest';
import { hashString, randomAt, intAt, drawWithout } from '../../src/daily/rng.js';

describe('hashString', () => {
  it('同じ文字列からは常に同じ値が出る', () => {
    expect(hashString('world-1:day:5')).toBe(hashString('world-1:day:5'));
  });

  it('違う文字列からは違う値が出る', () => {
    expect(hashString('world-1:day:5')).not.toBe(hashString('world-1:day:6'));
  });

  it('1文字違うだけで大きく変わる', () => {
    const a = hashString('abc');
    const b = hashString('abd');
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  it('32bit の符号なし整数を返す', () => {
    for (const input of ['', 'a', 'world-1:day:9999', '日本語も通す']) {
      const value = hashString(input);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('randomAt', () => {
  it('同じ (seed, index) からは常に同じ値が出る', () => {
    expect(randomAt(12345, 0)).toBe(randomAt(12345, 0));
  });

  it('index が違えば違う値が出る', () => {
    expect(randomAt(12345, 0)).not.toBe(randomAt(12345, 1));
  });

  it('seed が違えば違う値が出る', () => {
    expect(randomAt(12345, 0)).not.toBe(randomAt(54321, 0));
  });

  it('0以上1未満に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const value = randomAt(777, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('偏りが極端でない（200回の平均が0.5前後）', () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += randomAt(999, i);
    const mean = sum / 200;
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });
});

describe('intAt', () => {
  it('0以上 maxExclusive 未満の整数を返す', () => {
    for (let i = 0; i < 200; i++) {
      const value = intAt(42, i, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it('200回引けば5つの値が全部出る', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(intAt(42, i, 5));
    expect(seen.size).toBe(5);
  });

  it('maxExclusive が1なら常に0', () => {
    expect(intAt(42, 7, 1)).toBe(0);
  });

  it('maxExclusive が0以下なら投げる', () => {
    expect(() => intAt(42, 0, 0)).toThrow('maxExclusive must be positive: 0');
  });
});

describe('drawWithout', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('指定した個数だけ引く', () => {
    expect(drawWithout(1, items, 3)).toHaveLength(3);
  });

  it('同じものを二度引かない', () => {
    const drawn = drawWithout(1, items, 3);
    expect(new Set(drawn).size).toBe(3);
  });

  it('引いたものはすべて元の集合に含まれる', () => {
    for (const value of drawWithout(1, items, 3)) {
      expect(items).toContain(value);
    }
  });

  it('同じシードなら同じ並びが出る', () => {
    expect(drawWithout(1, items, 3)).toEqual(drawWithout(1, items, 3));
  });

  it('シードを変えれば複数の並びが現れる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(drawWithout(seed, items, 3).join());
    expect(seen.size).toBeGreaterThan(1);
  });

  it('要求が集合より多ければ全部返す', () => {
    expect(drawWithout(1, items, 99)).toHaveLength(5);
  });

  it('空の集合からは空を返す', () => {
    expect(drawWithout(1, [], 3)).toEqual([]);
  });

  it('元の配列を並べ替えない', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    drawWithout(1, input, 3);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
