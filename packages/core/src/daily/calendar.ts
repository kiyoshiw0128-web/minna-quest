/** 日本標準時の UTC からのずれ（分）。日本にサマータイムは無いので固定。 */
export const JST_OFFSET_MINUTES = 540;

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/** その瞬間が属する JST の日を、UTC の 00:00 に正規化した通し番号にする。 */
function jstDayIndex(at: number): number {
  return Math.floor((at + JST_OFFSET_MINUTES * MS_PER_MINUTE) / MS_PER_DAY);
}

/**
 * 開始日から数えて何日目かを返す。開始したその日が1日目。
 *
 * 日付が変わるのは JST の 00:00。cron が JST 05:00 に走るのは
 * 締めのタイミングであって、日付境界ではない。
 *
 * 現在時刻を引数で受け取るのは、日付境界の挙動を実機なしでテストするため。
 */
export function jstDayNumber(startedAt: string, now: Date): number {
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    throw new Error(`jstDayNumber: startedAt を日付として解釈できない: ${startedAt}`);
  }
  const days = jstDayIndex(now.getTime()) - jstDayIndex(startedAtMs);
  return Math.max(1, days + 1);
}
