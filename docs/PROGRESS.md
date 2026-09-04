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
| 3c | 戦闘API・報酬 | 未着手（計画も無い） |
| 4 | 画面・永続化のUI | 未着手（計画も無い） |

## いまの状態

- テスト **399件**（core 340 / worker 59）、typecheck クリーン、CI 緑
- `packages/core` は実行時依存ゼロ、乱数は `daily/` のシード付き純関数のみ
- `apps/worker` は Cloudflare Worker + D1 + Cron。API 4本、招待コード認証、JST 05:00 の締めと取り戻し
- **まだ遊べない。** 画面が無い。サーバは動くが、戦闘APIと報酬も未実装
- **デプロイは未実施。** `README.md` の手順を人が実行する必要がある
- リポジトリ: https://github.com/kiyoshiw0128-web/minna-quest （public）

## 次の一手

`feat/worker-d1` を main にマージする。そのあとは段階3c（戦闘API・報酬）か段階4（画面）で、
どちらも仕様・計画からになる。遊べるようにすることを優先するなら画面が先。

段階3b 計画: `docs/superpowers/plans/2026-09-04-worker-d1.md`
段階3b 仕様: `docs/superpowers/specs/2026-09-04-worker-d1-design.md`

## 書類の置き場所

| 何 | どこ |
|---|---|
| 全体の設計 | `docs/superpowers/specs/2026-09-03-minna-quest-design.md` |
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
- **`wrangler.toml` の `compatibility_date` は 2024-12-30 に低く固定してある。** ローカルの workerd の都合。
  本番にもこの値が乗るので、本番相当として使う前に wrangler ごと上げること
- **締めと日送りは `advanceDay` の1バッチだけ。** 個別のUPDATE関数は乖離の温床なので削除済み。復活させない
