import { catchUp } from './close.js';
import { handleGetBattle, handlePostBattle } from './routes/battle.js';
import { handleHire } from './routes/hire.js';
import { handleJoin } from './routes/join.js';
import { handleTavern } from './routes/tavern.js';
import { handleToday } from './routes/today.js';
import { handleVote } from './routes/vote.js';
import { handleWorld } from './routes/world.js';
import { fail, ok } from './respond.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return ok({ status: 'ok' });

    if (url.pathname === '/api/join' && request.method === 'POST') {
      return handleJoin(request, env);
    }

    if (url.pathname === '/api/today' && request.method === 'GET') {
      return handleToday(request, env);
    }

    if (url.pathname === '/api/vote' && request.method === 'POST') {
      return handleVote(request, env);
    }

    if (url.pathname === '/api/world' && request.method === 'GET') {
      return handleWorld(request, env);
    }

    if (url.pathname === '/api/tavern' && request.method === 'GET') {
      return handleTavern(request, env);
    }

    if (url.pathname === '/api/hire' && request.method === 'POST') {
      return handleHire(request, env);
    }

    if (url.pathname === '/api/battle' && request.method === 'GET') {
      return handleGetBattle(request, env);
    }

    if (url.pathname === '/api/battle' && request.method === 'POST') {
      return handlePostBattle(request, env);
    }

    // `/api/` 配下で上のどれにも一致しなかったものは、画面のアセットに
    // 横取りさせず、JSONの404を返す。画面側は全レスポンスをJSONとして
    // パースするため、ここでHTMLを返すと失敗理由が見えなくなる。
    if (url.pathname.startsWith('/api/')) return fail('not found', 404);

    // API以外は apps/web のビルド成果物（wrangler.toml の [assets]）に委ねる。
    // run_worker_first を立てているため、ここで明示的に呼ばないとアセットに
    // 届かない。存在しないパスは not_found_handling=spa により index.html が返る。
    return env.ASSETS.fetch(request);
  },

  // `SELECT id FROM worlds` はここだけ SQL がルート外に出るが、世界の一覧を
  // 取るだけの1行であり、store.ts に足すほどの面ではない。
  // 世界が増えたら store.ts に listWorldIds として移すこと。
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = new Date();
    const worlds = await env.DB.prepare('SELECT id FROM worlds').all<{ id: string }>();
    let totalClosed = 0;
    let failedCount = 0;
    // 世界ごとに独立して締める。1つの世界が例外を投げても、
    // 他の世界の進行を止めてはいけない（複数世界を運用する段階で顕在化する穴）。
    for (const world of worlds.results) {
      try {
        const closed = await catchUp(env.DB, world.id, now);
        totalClosed += closed;
        console.log(`world ${world.id}: closed ${closed} day(s)`);
      } catch (error) {
        failedCount += 1;
        console.error(`world ${world.id}: catchUp failed`, error);
      }
    }
    console.log(`scheduled done: closed ${totalClosed} day(s) total, ${failedCount} world(s) failed`);
  },
} satisfies ExportedHandler<Env>;
