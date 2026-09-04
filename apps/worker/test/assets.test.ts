import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

// 静的アセット（apps/web/dist）を Worker に足したことで、`/api/*` が
// アセット配信に横取りされていないかを検査する。画面側は全レスポンスを
// JSONとしてパースするため、APIパスがHTMLを返すと失敗理由が見えなくなる
// （wrangler.tomlの run_worker_first を外すとこの前提が崩れる）。
describe('静的アセットとAPIの優先順位', () => {
  it('/api/health はJSONを返す（アセットに横取りされない）', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.status).toBe(200);
  });

  it('/api/today は未認証でも401のJSONを返す（アセットに横取りされない）', async () => {
    const response = await SELF.fetch('https://example.com/api/today');
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('存在しないAPIパスは404のJSONを返し、index.htmlを返さない', async () => {
    const response = await SELF.fetch('https://example.com/api/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: false, error: 'not found' });
  });
});
