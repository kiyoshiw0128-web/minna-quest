# 進捗表

**再開するときはこの表だけ読めばよい。** 詳細は各段階の仕様書と計画書にある。

最終更新: 2026-09-06

## 段階

| 段階 | 中身 | 状態 |
|---|---|---|
| 1 | 戦闘エンジン `packages/core/src/battle/` | **完了・main にマージ済み** |
| 2 | 育成 `packages/core/src/progression/` | **完了・main にマージ済み** |
| 3a | 日次ロジック `packages/core/src/daily/` | **完了・main にマージ済み** |
| 3b | サーバ基盤 `apps/worker/` | **完了・main にマージ済み** |
| 4a | 画面・毎日の投票ループ `apps/web/` | **完了・main にマージ済み** |
| 3c | 戦闘API・報酬・酒場 | **完了・本番稼働中** |
| 4b | 戦闘の画面 | **完了・本番稼働中** |
| 3d | 転職・装備枠・パーティ操作 | **完了・本番稼働中** |
| 5 | 闘技場20階と裏ボス | **完了** |
| 6 | ペット | **完了** |
| 4c | 第2章以降のボス | 未着手 |

## いまの状態

- テスト **646件**（core 442 / worker 164 / web 40）、typecheck クリーン、CI 緑
- **本番稼働中: https://minna-quest.giocoso.workers.dev**（Cloudflare、D1は東京圏）
- `packages/core` は実行時依存ゼロ、乱数は `daily/` のシード付き純関数のみ
- `apps/worker` は Cloudflare Worker + D1 + Cron。API 12本、招待コード認証、JST 05:00 の締めと取り戻し
- `apps/web` は React。参加・今日・戦闘・仲間・履歴。同じ Worker が配信する
- **一通り遊べる。** 参加・投票・戦闘・報酬・仲間の雇用・転職・装備の変更
- イベント45個、タグ14種類。4本の相互排他の分岐（山賊/衛兵・森の精霊・遺跡・呪い）
- **闘技場20階**。1階ずつ上る個人戦。報酬は階ごと初回のみ。20階は裏ボス
- ペットは1匹だけ連れ、パーティ全員を底上げする。戦闘の5人目にはしない
- **章は第3章までで頭打ち。** 日数は進み続ける。終わりは作らない（闘技場が区切り）
- **無いもの: 装備品、第2章以降のボス、キャラクターの絵**
- **デプロイは未実施。** `README.md` の手順を人が実行する必要がある
- リポジトリ: https://github.com/kiyoshiw0128-web/minna-quest （public）

## 次の一手

第2章・第3章のボス（`bossForChapter` に定義が無く、その章のボスの日は
通常のイベントで進む）。次に装備品。

「溜めの窓」のパズルは闘技場20階（深淵の覇王）で成立させた。第1章のボスは
7日目に勝てる強さまで下げた結果、殴り合いのままである。

キャラクターの絵は未着手。**実在の商品の絵柄を模したものは作らない。**
一から描くSVGか、持ち込んだ画像を差す枠か、のどちらか。

仕様は `docs/superpowers/specs/` に段階ごとに置いてある。

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
corepack pnpm --filter @mq/web build    # worker のテストが dist を要求する
corepack pnpm -r test
corepack pnpm -r typecheck
corepack pnpm --filter @mq/worker dev   # ローカルで workerd を起動
corepack pnpm run release               # ビルド→移行→デプロイ をまとめて
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
