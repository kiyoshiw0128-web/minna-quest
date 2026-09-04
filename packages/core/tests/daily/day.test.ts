import { describe, it, expect } from 'vitest';
import { isBossDay, chapterOf, closeDay, BOSS_INTERVAL } from '../../src/daily/day.js';
import type { WorldDay } from '../../src/daily/day.js';
import type { Vote } from '../../src/daily/vote.js';

function day(over: Partial<WorldDay> = {}): WorldDay {
  return {
    dayNo: 3,
    optionIds: ['forest', 'cave', 'town'],
    chosenId: null,
    counts: null,
    tiebroken: null,
    ...over,
  };
}

describe('isBossDay', () => {
  it('7日ごとがボスの日', () => {
    expect(isBossDay(7)).toBe(true);
    expect(isBossDay(14)).toBe(true);
    expect(isBossDay(21)).toBe(true);
  });

  it('それ以外はボスの日ではない', () => {
    for (const dayNo of [1, 2, 3, 4, 5, 6, 8, 13]) {
      expect(isBossDay(dayNo)).toBe(false);
    }
  });

  it('0日目はボスの日ではない', () => {
    expect(isBossDay(0)).toBe(false);
  });

  it('間隔は7', () => {
    expect(BOSS_INTERVAL).toBe(7);
  });
});

describe('chapterOf', () => {
  it('1日目から7日目までが第1章', () => {
    for (let dayNo = 1; dayNo <= 7; dayNo++) {
      expect(chapterOf(dayNo)).toBe(1);
    }
  });

  it('8日目から14日目までが第2章', () => {
    expect(chapterOf(8)).toBe(2);
    expect(chapterOf(14)).toBe(2);
  });

  it('章はボスの日で切り替わらず、その翌日から変わる', () => {
    expect(chapterOf(7)).toBe(chapterOf(1));
    expect(chapterOf(8)).not.toBe(chapterOf(7));
  });
});

describe('closeDay', () => {
  const votes: Vote[] = [
    { playerId: 'a', optionId: 'forest' },
    { playerId: 'b', optionId: 'forest' },
    { playerId: 'c', optionId: 'cave' },
  ];

  it('多数決の結果を確定させる', () => {
    const closed = closeDay(day(), votes, 1);
    expect(closed.chosenId).toBe('forest');
  });

  it('票数も記録する', () => {
    expect(closeDay(day(), votes, 1).counts).toEqual({ forest: 2, cave: 1, town: 0 });
  });

  it('日付と選択肢はそのまま持ち越す', () => {
    const closed = closeDay(day(), votes, 1);
    expect(closed.dayNo).toBe(3);
    expect(closed.optionIds).toEqual(['forest', 'cave', 'town']);
  });

  it('二重に締めても結果が変わらない', () => {
    const once = closeDay(day(), votes, 1);
    const twice = closeDay(once, votes, 1);
    expect(twice).toEqual(once);
  });

  it('締め済みの日は、あとから票が増えても動かない', () => {
    const once = closeDay(day(), votes, 1);
    const laterVotes: Vote[] = [...votes, { playerId: 'd', optionId: 'cave' }, { playerId: 'e', optionId: 'cave' }];
    expect(closeDay(once, laterVotes, 1).chosenId).toBe('forest');
  });

  it('締め済みの日は同一のオブジェクトをそのまま返す', () => {
    const once = closeDay(day(), votes, 1);
    expect(closeDay(once, votes, 1)).toBe(once);
  });

  it('同数で決まったかどうかも記録する', () => {
    expect(closeDay(day(), votes, 1).tiebroken).toBe(false);
    const split: Vote[] = [{ playerId: 'a', optionId: 'forest' }, { playerId: 'b', optionId: 'cave' }];
    expect(closeDay(day(), split, 1).tiebroken).toBe(true);
  });

  it('元の日を書き換えない', () => {
    const before = day();
    closeDay(before, votes, 1);
    expect(before.chosenId).toBeNull();
    expect(before.counts).toBeNull();
    expect(before.tiebroken).toBeNull();
  });

  it('誰も投票しなくても締まる', () => {
    const closed = closeDay(day(), [], 5);
    expect(closed.chosenId).not.toBeNull();
    expect(closed.optionIds).toContain(closed.chosenId);
  });
});
