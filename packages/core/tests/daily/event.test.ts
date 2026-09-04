import { describe, it, expect } from 'vitest';
import {
  matchesCondition,
  eligibleEvents,
  pickEvents,
  applyOutcome,
  OPTIONS_PER_DAY,
} from '../../src/daily/event.js';
import type { DailyEvent, WorldFlags } from '../../src/daily/event.js';

const flags: WorldFlags = { chapter: 2, tags: ['met-elder'] };

function event(id: string, condition: DailyEvent['condition'] = {}): DailyEvent {
  return { id, name: id, kind: 'story', condition, outcome: { gold: 10 } };
}

describe('matchesCondition', () => {
  it('条件が空なら常に通る', () => {
    expect(matchesCondition({}, flags)).toBe(true);
  });

  it('最低の章に届いていなければ弾く', () => {
    expect(matchesCondition({ minChapter: 3 }, flags)).toBe(false);
  });

  it('最低の章に届いていれば通る', () => {
    expect(matchesCondition({ minChapter: 2 }, flags)).toBe(true);
  });

  it('最大の章を超えていれば弾く', () => {
    expect(matchesCondition({ maxChapter: 1 }, flags)).toBe(false);
  });

  it('章の範囲に収まっていれば通る', () => {
    expect(matchesCondition({ minChapter: 1, maxChapter: 3 }, flags)).toBe(true);
  });

  it('必要なフラグを持っていれば通る', () => {
    expect(matchesCondition({ requiresTags: ['met-elder'] }, flags)).toBe(true);
  });

  it('必要なフラグを1つでも欠いていれば弾く', () => {
    expect(matchesCondition({ requiresTags: ['met-elder', 'has-map'] }, flags)).toBe(false);
  });

  it('禁止フラグを持っていれば弾く', () => {
    expect(matchesCondition({ forbidsTags: ['met-elder'] }, flags)).toBe(false);
  });

  it('禁止フラグを持っていなければ通る', () => {
    expect(matchesCondition({ forbidsTags: ['has-map'] }, flags)).toBe(true);
  });
});

describe('eligibleEvents', () => {
  const pool: DailyEvent[] = [
    event('always'),
    event('ch3only', { minChapter: 3 }),
    event('needsElder', { requiresTags: ['met-elder'] }),
    event('bannedByElder', { forbidsTags: ['met-elder'] }),
  ];

  it('条件を満たすものだけを返す', () => {
    expect(eligibleEvents(pool, flags).map((e) => e.id)).toEqual(['always', 'needsElder']);
  });

  it('元のプールを変更しない', () => {
    eligibleEvents(pool, flags);
    expect(pool).toHaveLength(4);
  });
});

describe('pickEvents', () => {
  const pool: DailyEvent[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => event(id));

  it('3つ引く', () => {
    expect(pickEvents(pool, flags, 1)).toHaveLength(OPTIONS_PER_DAY);
  });

  it('同じものを二度出さない', () => {
    const picked = pickEvents(pool, flags, 1);
    expect(new Set(picked.map((e) => e.id)).size).toBe(OPTIONS_PER_DAY);
  });

  it('同じシードなら全員が同じ3択を見る', () => {
    expect(pickEvents(pool, flags, 7)).toEqual(pickEvents(pool, flags, 7));
  });

  it('日が変われば（シードが変われば）3択も変わる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(pickEvents(pool, flags, seed).map((e) => e.id).join());
    expect(seen.size).toBeGreaterThan(1);
  });

  it('条件を満たさないイベントは出さない', () => {
    const gated: DailyEvent[] = [
      event('ok1'),
      event('ok2'),
      event('locked', { minChapter: 9 }),
    ];
    const picked = pickEvents(gated, flags, 3).map((e) => e.id);
    expect(picked).not.toContain('locked');
  });

  it('候補が3つに満たなければあるだけ返す', () => {
    const thin: DailyEvent[] = [event('only')];
    expect(pickEvents(thin, flags, 1)).toHaveLength(1);
  });

  it('OPTIONS_PER_DAY は3', () => {
    expect(OPTIONS_PER_DAY).toBe(3);
  });
});

describe('applyOutcome', () => {
  function withTags(...tags: readonly string[]): DailyEvent {
    return { id: 'e', name: 'e', kind: 'story', condition: {}, outcome: { addTags: tags } };
  }

  const empty: WorldFlags = { chapter: 1, tags: [] };

  it('結果のタグが次の日のフラグに乗る', () => {
    expect(applyOutcome(empty, withTags('met-elder')).tags).toEqual(['met-elder']);
  });

  it('すでに持っているタグは重複しない', () => {
    const flagsWith: WorldFlags = { chapter: 1, tags: ['met-elder'] };
    expect(applyOutcome(flagsWith, withTags('met-elder')).tags).toEqual(['met-elder']);
  });

  it('新しいタグだけが足される', () => {
    const flagsWith: WorldFlags = { chapter: 1, tags: ['met-elder'] };
    expect(applyOutcome(flagsWith, withTags('met-elder', 'has-pet')).tags).toEqual([
      'met-elder',
      'has-pet',
    ]);
  });

  it('結果のないイベントはフラグを変えない', () => {
    const battle: DailyEvent = {
      id: 'b', name: 'b', kind: 'battle', enemyId: 'balgos', condition: {},
    };
    expect(applyOutcome(empty, battle)).toBe(empty);
  });

  it('addTags のない結果はフラグを変えない', () => {
    const gold: DailyEvent = {
      id: 'g', name: 'g', kind: 'story', condition: {}, outcome: { gold: 30 },
    };
    expect(applyOutcome(empty, gold)).toBe(empty);
  });

  it('章は動かさない', () => {
    const flagsAt: WorldFlags = { chapter: 3, tags: [] };
    expect(applyOutcome(flagsAt, withTags('saw-ruins')).chapter).toBe(3);
  });

  it('元のフラグを変更しない', () => {
    const before: WorldFlags = { chapter: 1, tags: ['met-elder'] };
    applyOutcome(before, withTags('has-pet'));
    expect(before.tags).toEqual(['met-elder']);
  });
});
