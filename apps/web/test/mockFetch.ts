import { vi } from 'vitest';

/**
 * fetch の戻り値を最小限で作る。api.ts が読むのは status と json() だけなので、
 * Response の他のプロパティは使わない。
 */
export function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

/**
 * URL のパスと HTTP メソッドで振り分ける fetch モック。
 * 同じパス・メソッドに複数回呼ばれた場合は、渡した応答を配列の順に消費する
 * （最後の1件は使い回す）。投票の競合→読み直し、のような「1回目と2回目で
 * 応答が変わる」流れをテストで再現するために順序を持たせている。
 */
export function installFetchMock(
  routes: Record<string, Response | Response[]>,
): void {
  const cursors = new Map<string, number>();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const key = `${method} ${url}`;
      const entry = routes[key];
      if (entry === undefined) {
        throw new Error(`このテストで想定していないリクエスト: ${key}`);
      }
      if (!Array.isArray(entry)) return entry;

      const index = cursors.get(key) ?? 0;
      cursors.set(key, Math.min(index + 1, entry.length - 1));
      return entry[index];
    }),
  );
}
