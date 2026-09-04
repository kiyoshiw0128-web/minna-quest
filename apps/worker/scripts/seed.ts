/**
 * 世界と1日目と招待コードを投入する SQL を標準出力に書き出す。
 *
 *   pnpm --filter @mq/worker exec tsx scripts/seed.ts "みんなの冒険" 4 > seed.sql
 *   wrangler d1 execute minna-quest --remote --file=seed.sql
 *
 * 招待コードの平文は標準エラーに出る。**これを控えて、DBには残らない。**
 * cron は既存の行を締めて次を開く作りなので、1日目の行が無いと何も始まらない。
 * `node:crypto` を使うのは、これが Node で動くスクリプトで、Worker のグローバルな
 * crypto が無いから。
 */
import { createHash, randomBytes } from 'node:crypto';
import { EVENTS, chapterOf, daySeed, pickEvents } from '@mq/core';
import type { DailyEvent } from '@mq/core';

const name = process.argv[2] ?? 'みんなの冒険';
const inviteCount = Number(process.argv[3] ?? '4');

const token = (): string => randomBytes(16).toString('hex');
const hash = (input: string): string => createHash('sha256').update(input).digest('hex');
const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const worldId = token();
const now = new Date().toISOString();

const pool: readonly DailyEvent[] = Object.values(EVENTS);
const firstOptions = pickEvents(pool, { chapter: chapterOf(1), tags: [] }, daySeed(worldId, 1));

const lines: string[] = [
  `INSERT INTO worlds (id, name, started_at, current_day, chapter, tags, created_at) VALUES (${quote(worldId)}, ${quote(name)}, ${quote(now)}, 1, ${chapterOf(1)}, '[]', ${quote(now)});`,
  `INSERT INTO world_days (world_id, day_no, option_ids) VALUES (${quote(worldId)}, 1, ${quote(JSON.stringify(firstOptions.map((event) => event.id)))});`,
];

for (let i = 0; i < inviteCount; i++) {
  const code = token();
  lines.push(
    `INSERT INTO invites (code_hash, world_id, created_at) VALUES (${quote(hash(code))}, ${quote(worldId)}, ${quote(now)});`,
  );
  console.error(`invite ${i + 1}: ${code}`);
}

console.error(`world id: ${worldId}`);
console.log(lines.join('\n'));
