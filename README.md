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

## サーバを動かす

ローカル:

```bash
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

# 4. デプロイ
corepack pnpm --filter @mq/worker deploy
```

cron は JST 05:00（UTC 20:00）に走る。翌朝、`wrangler tail` でログを見て
`closed N day(s)` が出ていれば動いている。

画面はまだ無いので、ルートを開くと404が返る。API を直接叩いて確認する。
