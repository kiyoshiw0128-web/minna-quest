import { handleJoin } from './routes/join.js';
import { fail, ok } from './respond.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return ok({ status: 'ok' });

    if (url.pathname === '/api/join' && request.method === 'POST') {
      return handleJoin(request, env);
    }

    return fail('not found', 404);
  },
} satisfies ExportedHandler<Env>;
