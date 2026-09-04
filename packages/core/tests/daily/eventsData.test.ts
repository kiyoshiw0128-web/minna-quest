import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../src/data/events.js';
import { NAMES } from '../../src/data/names.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { eligibleEvents, OPTIONS_PER_DAY } from '../../src/daily/event.js';
import { RECRUITS_PER_DAY } from '../../src/daily/recruit.js';
import type { DailyEvent } from '../../src/daily/event.js';

const events: readonly DailyEvent[] = Object.values(EVENTS);

describe('イベントマスタの健全性', () => {
  it('キーと id が一致している', () => {
    for (const [key, event] of Object.entries(EVENTS)) {
      expect(event.id).toBe(key);
    }
  });

  it('戦闘イベントは実在する敵を指す', () => {
    for (const event of events) {
      if (event.kind === 'battle') {
        expect(event.enemyId).toBeDefined();
        expect(Object.keys(ENEMIES)).toContain(event.enemyId);
      }
    }
  });

  it('非戦闘イベントは結果を持つ', () => {
    for (const event of events) {
      if (event.kind === 'story') expect(event.outcome).toBeDefined();
    }
  });

  it('章の範囲が逆転していない', () => {
    for (const event of events) {
      const { minChapter, maxChapter } = event.condition;
      if (minChapter !== undefined && maxChapter !== undefined) {
        expect(minChapter).toBeLessThanOrEqual(maxChapter);
      }
    }
  });

  it('必要フラグと禁止フラグが同じものを指していない', () => {
    for (const event of events) {
      for (const tag of event.condition.requiresTags ?? []) {
        expect(event.condition.forbidsTags ?? []).not.toContain(tag);
      }
    }
  });

  it('要求されるフラグは、どれかのイベントが与えうる', () => {
    const grantable = new Set(events.flatMap((event) => event.outcome?.addTags ?? []));
    for (const event of events) {
      for (const tag of event.condition.requiresTags ?? []) {
        expect(grantable).toContain(tag);
      }
    }
  });

  it('第1章でも第2章でも、3択を埋められるだけの候補がある', () => {
    for (const chapter of [1, 2]) {
      const count = eligibleEvents(events, { chapter, tags: [] }).length;
      expect(count).toBeGreaterThanOrEqual(OPTIONS_PER_DAY);
    }
  });

  it('フラグを集めきった状態でも3択を埋められる', () => {
    const allTags = events.flatMap((event) => event.outcome?.addTags ?? []);
    for (const chapter of [1, 2]) {
      const count = eligibleEvents(events, { chapter, tags: allTags }).length;
      expect(count).toBeGreaterThanOrEqual(OPTIONS_PER_DAY);
    }
  });
});

describe('人名マスタの健全性', () => {
  it('酒場に並べる人数より十分多い', () => {
    expect(NAMES.length).toBeGreaterThan(RECRUITS_PER_DAY * 3);
  });

  it('重複していない', () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });
});
