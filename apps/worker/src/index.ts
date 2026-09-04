import { catchUp } from './close.js';
import { handleJoin } from './routes/join.js';
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

    return fail('not found', 404);
  },

  // `SELECT id FROM worlds` はここだけ SQL がルート外に出るが、世界の一覧を
  // 取るだけの1行であり、store.ts に足すほどの面ではない。
  // 世界が増えたら store.ts に listWorldIds として移すこと。
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = new Date();
    const worlds = await env.DB.prepare('SELECT id FROM worlds').all<{ id: string }>();
    for (const world of worlds.results) {
      const closed = await catchUp(env.DB, world.id, now);
      console.log(`world ${world.id}: closed ${closed} day(s)`);
    }
  },
} satisfies ExportedHandler<Env>;
