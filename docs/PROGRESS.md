# 進捗表

**再開するときはこの表だけ読めばよい。** 詳細は各段階の仕様書と計画書にある。

最終更新: 2026-09-05

## 段階

| 段階 | 中身 | 状態 |
|---|---|---|
| 1 | 戦闘エンジン `packages/core/src/battle/` | **完了・main にマージ済み** |
| 2 | 育成 `packages/core/src/progression/` | **完了・main にマージ済み** |
| 3a | 日次ロジック `packages/core/src/daily/` | **完了・main にマージ済み** |
| 3b | サーバ基盤 `apps/worker/` | **完了。`feat/worker-d1` でレビュー済み、マージ待ち** |
| 4a | 画面・毎日の投票ループ `apps/web/` | **完了・main にマージ済み** |
| 3c | 戦闘API・報酬 | 未着手（計画も無い） |
| 4b | 戦闘・編成の画面 | 未着手。3c の後 |

## いまの状態

- テスト **430件**（core 358 / worker 62 / web 10）、typecheck クリーン、CI 緑
- `packages/core` は実行時依存ゼロ、乱数は `daily/` のシード付き純関数のみ
- `apps/worker` は Cloudflare Worker + D1 + Cron。API 4本、招待コード認証、JST 05:00 の締めと取り戻し
- `apps/web` は React。参加・今日の3択と投票・世界の履歴の3画面。同じ Worker が配信する
- **毎日の周回は成立する。** 参加して投票し、翌朝に決まっているのを見るところまで
- **戦闘はまだできない。** 戦闘APIが無い。エンジンにはあるが繋がっていない
- **デプロイは未実施。** `README.md` の手順を人が実行する必要がある
- リポジトリ: https://github.com/kiyoshiw0128-web/minna-quest （public）

## 次の一手

段階3c（戦闘API・報酬）。エンジンの `simulate` をサーバから呼び、8ターンのプランを
受けて結果を返す。「誰かが倒せば世界としては撃破」の集約もここ。
そのあとで段階4b（戦闘・編成の画面）。

まだ**人がデプロイを実行していない**。`README.md` の手順を人が走らせる必要がある。

段階4a 仕様: `docs/superpowers/specs/2026-09-05-web-daily-loop-design.md`
段階3b 仕様: `docs/superpowers/specs/2026-09-04-worker-d1-design.md`

## 書類の置き場所

| 何 | どこ |
|---|---|
| 全体の設計 | `docs/superpowers/specs/2026-09-03-minna-quest-design.md` |
| **エンジンの到達点** | **`docs/ENGINE.md`** — core に何が入って何が入っていないか |
| 段階3bの設計 | `docs/superpowers/specs/2026-09-04-worker-d1-design.md` |
| 各段階の実装計画 | `docs/superpowers/plans/` |
| 積み残し | `docs/deferred.md` |

## よく使うコマンド

```bash
corepack pnpm -r test
corepack pnpm -r typecheck
corepack pnpm --filter @mq/worker dev   # ローカルで workerd を起動
```

## 踏みやすい地雷

- **`data/events.ts` は追記のみ。** 削除や並べ替えをすると過去の日の3択が変わる
- **`closeDay` に `daySeed` を渡さない。** タイブレークは `voteSeed`。型が同じなので防げない
- **`packages/core/tsconfig.json` に `noEmit` が無い。** 素の `tsc` を走らせるとソースの隣に生成物を吐く
- **`apps/worker/src/store.ts` 以外に SQL を書かない。** 行の型もこのファイルの外に出さない
- **`compatibility_date` を、手元のテストが走らない日付に上げない。** 実行環境が古いと
  警告を出して黙って古い挙動に丸められ、本番だけが未検証の設定で動く
- **`nodeBoundaryGuard.ts` の番人を消さない。** Workerの型定義が見張り先の名前を
  宣言し始めると typecheck が落ちるが、それは境界が壊れたのではなく見張り先が
  正規の型になっただけ。別の Node 専用の名前に移すこと
- **締めと日送りは `advanceDay` の1バッチだけ。** 個別のUPDATE関数は乖離の温床なので削除済み。復活させない
- **`apps/worker` のテストは `apps/web/dist` を必要とする。** 静的アセットの設定が
  そこを指しているため、無いとテストが1件も起動しない。CIは先にビルドしている
- **`wrangler.toml` の `run_worker_first` を外さない。** 外すと静的アセットが
  `/api/*` を横取りし、画面には「通信に失敗しました」としか出なくなる
- **ルートの deploy 用スクリプト名は `release`。** pnpm は `deploy` を予約語として
  横取りするため、`pnpm deploy` は別のものになる
