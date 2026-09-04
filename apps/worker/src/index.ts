import { fail, ok } from './respond.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return ok({ status: 'ok' });
    }

    return fail('not found', 404);
  },
} satisfies ExportedHandler<Env>;
