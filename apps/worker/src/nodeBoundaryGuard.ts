/**
 * Worker/Node境界の型チェック用プローブ。
 *
 * apps/worker/src は Cloudflare Worker として動くので、Node専用のグローバル
 * （`process`, `Buffer`, `node:crypto` 等）を参照できてはいけない。実行時にそれらは
 * 存在せず、そのままデプロイすればクラッシュする。`scripts/`（seed.ts など）は
 * Node で動くので `tsconfig.scripts.json` で別コンパイルにして `types: ["node"]` を
 * 与えているが、もし誰かがこの分離を戻して `src` と `scripts` を1つの
 * `tsconfig.json` に含めてしまうと、Node の型がここにも漏れて `process` などが
 * 何のエラーも無く使えてしまう（2026-09-04 のレビューで実際に踏んだ）。
 *
 * それを検知するための番人。次の行は本来型エラーになるべきで、
 * `@ts-expect-error` が効いている（＝実際にエラーが出ている）限りは
 * `tsc --noEmit` が通る。逆に境界が壊れて `process` を参照できてしまうと
 * `@ts-expect-error` 自体が「エラーが無いのに付けている」というエラーになり、
 * typecheck が落ちる。
 *
 * この関数は呼ばない。呼べば本当に存在しない `process` を参照してクラッシュする。
 */
function neverCalledNodeGlobalProbe(): void {
  // @ts-expect-error process はNode専用のグローバル。Workerのsrcには存在しない
  const leak: unknown = process.env.TEST_LEAK;
  void leak;
}
void neverCalledNodeGlobalProbe;
