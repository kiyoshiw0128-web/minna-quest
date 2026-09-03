# みんなクエスト（仮）

身内数人で遊ぶ、デイリー制のブラウザRPG。Cloudflare Worker + D1。

**物語は全員で共有し、戦力は各自で育てる。**
毎日みんなが投票して世界のルートが多数決で決まり、そこで起きるボス戦には
各自が自分で編成したパーティで挑む。

戦闘は完全事前セット式（1〜8ターン目の行動を先に並べて自動再生）で、乱数はゼロ。
敵の行動表も事前公開なので、運試しではなく解けるパズルになっている。

## ドキュメント

- [設計書](docs/superpowers/specs/2026-09-03-minna-quest-design.md) — 2026-09-03 確定
- 実装計画 — `docs/superpowers/plans/`

## 状態

設計確定。実装は段階1（戦闘エンジン `packages/core/battle`）から着手。

## 構成

```
packages/core/     ゲームロジック（純TS・依存ゼロ・Vitest）
apps/worker/       Cloudflare Worker（API・D1・Cron）
apps/web/          Vite + React
```
