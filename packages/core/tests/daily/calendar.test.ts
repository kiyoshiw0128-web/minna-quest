import { describe, it, expect } from 'vitest';
import { jstDayNumber, JST_OFFSET_MINUTES } from '../../src/daily/calendar.js';

// 2026-09-04T00:00:00+09:00 = 2026-09-03T15:00:00Z
const started = '2026-09-03T15:00:00.000Z';

describe('JST_OFFSET_MINUTES', () => {
  it('日本標準時は UTC+9', () => {
    expect(JST_OFFSET_MINUTES).toBe(540);
  });
});

describe('jstDayNumber', () => {
  it('開始したその日が1日目', () => {
    expect(jstDayNumber(started, new Date('2026-09-03T15:00:00.000Z'))).toBe(1);
  });

  it('同じJSTの日のうちは1日目のまま', () => {
    // 2026-09-04T23:59:59+09:00
    expect(jstDayNumber(started, new Date('2026-09-04T14:59:59.000Z'))).toBe(1);
  });

  it('JSTの00:00をまたぐと2日目になる', () => {
    // 2026-09-05T00:00:00+09:00
    expect(jstDayNumber(started, new Date('2026-09-04T15:00:00.000Z'))).toBe(2);
  });

  it('cron が走る JST 05:00 は、その日の途中', () => {
    // 2026-09-05T04:59:59+09:00 と 05:00:00+09:00 は同じ日
    const before = jstDayNumber(started, new Date('2026-09-04T19:59:59.000Z'));
    const after = jstDayNumber(started, new Date('2026-09-04T20:00:00.000Z'));
    expect(before).toBe(2);
    expect(after).toBe(2);
  });

  it('月をまたいでも数え続ける', () => {
    // 2026-10-04T00:00:00+09:00 は開始から30日後 = 31日目
    expect(jstDayNumber(started, new Date('2026-10-03T15:00:00.000Z'))).toBe(31);
  });

  it('うるう年の2月29日をまたげる', () => {
    // 2028-02-28T00:00+09:00 開始、2028-03-01T00:00+09:00 は3日目
    const leapStart = '2028-02-27T15:00:00.000Z';
    expect(jstDayNumber(leapStart, new Date('2028-02-29T15:00:00.000Z'))).toBe(3);
  });

  it('開始より前の時刻でも1を下回らない', () => {
    expect(jstDayNumber(started, new Date('2026-09-01T00:00:00.000Z'))).toBe(1);
  });

  it('常に整数を返す', () => {
    for (let hours = 0; hours < 72; hours += 7) {
      const now = new Date(Date.parse(started) + hours * 3600_000);
      expect(Number.isInteger(jstDayNumber(started, now))).toBe(true);
    }
  });
});
