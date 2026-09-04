/**
 * Worker/Node境界の「型」チェック用プローブ。実行時の境界ではないことに注意。
 *
 * `wrangler.toml` の `nodejs_compat` により、実行時には `process` や `Buffer` は
 * 実際に存在する（2026-09-04 のレビューで実機計測して確認済み: `typeof process === "object"`）。
 * つまりこのファイルは「実行時にクラッシュするから守る」ものではない。守っているのは
 * 型のほうで、apps/worker/src の `tsconfig.json` には Node の型宣言（`types: ["node"]`）を
 * 含めていない。`scripts/`（seed.ts など）は Node で動くので `tsconfig.scripts.json` で
 * 別コンパイルにして `types: ["node"]` を与えているが、もし誰かがこの分離を戻して
 * `src` と `scripts` を1つの `tsconfig.json` に含めてしまうと、Node の型が `src` にも
 * 漏れて `process` などを参照するコードが型エラー無しで書けてしまう。実行時には
 * nodejs_compat のおかげで動いてしまうため、型検査を通さずに Node 専用APIへの
 * 依存が紛れ込んでも誰も気付けない。
 *
 * それを検知するための番人。次の行は本来型エラーになるべきで、
 * `@ts-expect-error` が効いている（＝実際にエラーが出ている）限りは
 * `tsc --noEmit` が通る。逆に境界が壊れて `process` の型が見えてしまうと
 * `@ts-expect-error` 自体が「エラーが無いのに付けている」というエラーになり、
 * typecheck が落ちる。あくまで型の境界であって、実行時にこの関数を呼んでも
 * （nodejs_compat が有効な環境では）クラッシュしない。
 *
 * この関数は呼ばない。型検査だけを目的とした未使用コードであり、実行する意味が無い。
 */
function neverCalledNodeGlobalProbe(): void {
  // @ts-expect-error process はNode専用のグローバル。Workerのsrcには存在しない
  const leak: unknown = process.env.TEST_LEAK;
  void leak;
}
void neverCalledNodeGlobalProbe;
