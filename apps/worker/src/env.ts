export type Env = {
  DB: D1Database;
  // apps/web のビルド成果物（apps/web/dist）。run_worker_first のもとでは
  // Worker が自分でこれを呼んで初めてアセットが返る（wrangler.toml参照）。
  ASSETS: Fetcher;
};
