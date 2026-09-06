export type Env = {
  DB: D1Database;
  // apps/web のビルド成果物（apps/web/dist）。run_worker_first のもとでは
  // Worker が自分でこれを呼んで初めてアセットが返る（wrangler.toml参照）。
  ASSETS: Fetcher;
  // Resend のAPIキー。`wrangler secret put RESEND_API_KEY` で設定する秘密。
  // 未設定でも他の機能が壊れないよう、mail.ts側でoptionalとして扱う
  // （設計書 §5 — キーを入れる前でもデプロイできる必要がある）。
  RESEND_API_KEY?: string;
};
