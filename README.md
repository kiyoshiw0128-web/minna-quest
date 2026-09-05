# みんなクエスト（仮）

身内数人で遊ぶ、デイリー制のブラウザRPG。Cloudflare Worker + D1。

**物語は全員で共有し、戦力は各自で育てる。**
毎日みんなが投票して世界のルートが多数決で決まり、そこで起きるボス戦には
各自が自分で編成したパーティで挑む。

戦闘は完全事前セット式（1〜8ターン目の行動を先に並べて自動再生）で、乱数はゼロ。
敵の行動表も事前公開なので、運試しではなく解けるパズルになっている。

## ドキュメント

- [設計書](docs/superpowers/specs/2026-09-03-minna-quest-design.md) — 2026-09-03 確定
- [実装計画](docs/superpowers/plans/2026-09-03-battle-engine.md) — 段階1（戦闘エンジン）
- [積み残し](docs/deferred.md) — 段階2以降で拾うもの

## 状態

段階1（戦闘エンジン）完了。91テスト通過、依存ゼロ、乱数なし。
次は段階2（育成 `packages/core/progression`）。

## 構成

```
packages/core/     ゲームロジック（純TS・依存ゼロ・Vitest）
apps/worker/       Cloudflare Worker（API・D1・Cron）
apps/web/          Vite + React
```

## テストを走らせる

```bash
corepack pnpm --filter @mq/web build   # 初回・画面を変えた後に必要
corepack pnpm -r test
corepack pnpm -r typecheck
```

`apps/worker` のテストは `apps/web/dist` を必要とする。Worker が画面を静的アセットと
して配信する設定になっているためで、このディレクトリが無いと Worker のテストは
1件も起動せずに落ちる。`dist` は生成物なのでリポジトリには入っていない。

## サーバを動かす

ローカル:

```bash
# 画面（apps/web/dist）が無いと Worker が静的アセットを配信できない。
# 一度もビルドしていない、または画面のコードを変えた後は先にビルドする。
corepack pnpm --filter @mq/web build

corepack pnpm --filter @mq/worker exec wrangler d1 migrations apply minna-quest --local
corepack pnpm --filter @mq/worker dev
```

本番へのデプロイ:

```bash
# 1. D1 を作り、出力された database_id を wrangler.toml に書く
corepack pnpm --filter @mq/worker exec wrangler d1 create minna-quest

# 2. スキーマを当てる
corepack pnpm --filter @mq/worker exec wrangler d1 migrations apply minna-quest --remote

# 3. 世界と招待コードを作る（コードは標準エラーに出るので控える）
corepack pnpm --filter @mq/worker exec tsx scripts/seed.ts "みんなの冒険" 4 > seed.sql
corepack pnpm --filter @mq/worker exec wrangler d1 execute minna-quest --remote --file=seed.sql
rm seed.sql

# 4. 画面のビルド → 未適用のマイグレーション → デプロイ をまとめて行う。
#    3つを別々に走らせると、片方だけ通った状態で本番が壊れる。実際に
#    2026-09-05、マイグレーションを適用しないままデプロイして、
#    新しいコードが存在しない列を参照する状態になった。
corepack pnpm run release
```

`corepack pnpm run release`（ルートの package.json）は `apps/web` のビルドと
`wrangler deploy` をこの順で必ず1コマンドにまとめたもの。`apps/worker` だけを
`wrangler deploy` する経路を使わないこと。
（スクリプト名を `deploy` にしなかったのは、`pnpm deploy` が pnpm 自身の
予約コマンド（ワークスペースからデプロイ用サブセットを作る機能）と衝突し、
挙動が意図と変わってしまうため。）

cron は JST 05:00（UTC 20:00）に走る。翌朝、`wrangler tail` でログを見て
`closed N day(s)` が出ていれば動いている。

画面（`apps/web`）は Worker から同一オリジンで配信する（`apps/worker/wrangler.toml`
の `[assets]`）。`/api/*` は Worker のコードが必ず先に処理し、それ以外は画面の
`index.html`（SPA）にフォールバックする。
