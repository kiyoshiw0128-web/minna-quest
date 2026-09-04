import { describe, it, expect } from 'vitest';
import { tallyVotes } from '../../src/daily/vote.js';
import type { Vote } from '../../src/daily/vote.js';

const options = ['forest', 'cave', 'town'];

function vote(playerId: string, optionId: string): Vote {
  return { playerId, optionId };
}

describe('tallyVotes - 多数決', () => {
  it('最多得票の選択肢が勝つ', () => {
    const votes = [vote('a', 'forest'), vote('b', 'forest'), vote('c', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.winner).toBe('forest');
    expect(tally.tiebroken).toBe(false);
  });

  it('票数を選択肢ごとに返す', () => {
    const votes = [vote('a', 'forest'), vote('b', 'forest'), vote('c', 'cave')];
    expect(tallyVotes(votes, options, 1).counts).toEqual({ forest: 2, cave: 1, town: 0 });
  });

  it('1人でも成立する', () => {
    const tally = tallyVotes([vote('a', 'town')], options, 1);
    expect(tally.winner).toBe('town');
    expect(tally.tiebroken).toBe(false);
  });
});

describe('tallyVotes - 票の扱い', () => {
  it('同じ人が2回投票したら最後の1票だけ数える', () => {
    const votes = [vote('a', 'forest'), vote('a', 'cave'), vote('b', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.counts).toEqual({ forest: 0, cave: 2, town: 0 });
    expect(tally.winner).toBe('cave');
  });

  it('提示されていない選択肢への票は無視する', () => {
    const votes = [vote('a', 'moon'), vote('b', 'forest')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.counts).toEqual({ forest: 1, cave: 0, town: 0 });
  });

  it('提示外に投票し直しても、前の有効票は取り消されない', () => {
    const votes = [vote('a', 'forest'), vote('a', 'moon')];
    expect(tallyVotes(votes, options, 1).counts.forest).toBe(1);
  });
});

describe('tallyVotes - タイブレーク', () => {
  it('同数ならシードで決まり、tiebroken が立つ', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(['forest', 'cave']).toContain(tally.winner);
    expect(tally.tiebroken).toBe(true);
  });

  it('同じシードなら同じ結果になる', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    expect(tallyVotes(votes, options, 42)).toEqual(tallyVotes(votes, options, 42));
  });

  it('シードが違えば結果が変わりうる', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    const winners = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      winners.add(tallyVotes(votes, options, seed).winner);
    }
    expect(winners.size).toBe(2);
  });

  it('タイブレークは同数の選択肢の中からしか選ばない', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    for (let seed = 0; seed < 30; seed++) {
      expect(tallyVotes(votes, options, seed).winner).not.toBe('town');
    }
  });

  it('誰も投票しなければ全部0票で並び、シードで決まる', () => {
    const tally = tallyVotes([], options, 5);
    expect(tally.counts).toEqual({ forest: 0, cave: 0, town: 0 });
    expect(options).toContain(tally.winner);
    expect(tally.tiebroken).toBe(true);
  });
});

describe('tallyVotes - 異常系', () => {
  it('選択肢が空なら投げる', () => {
    expect(() => tallyVotes([], [], 1)).toThrow('no options to tally');
  });

  it('元の配列を変更しない', () => {
    const votes = [vote('a', 'forest')];
    tallyVotes(votes, options, 1);
    expect(votes).toHaveLength(1);
    expect(options).toEqual(['forest', 'cave', 'town']);
  });
});
