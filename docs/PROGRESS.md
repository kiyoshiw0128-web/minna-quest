# 進捗表

**再開するときはこの表だけ読めばよい。** 詳細は各段階の仕様書と計画書にある。

最終更新: 2026-09-04

## 段階

| 段階 | 中身 | 状態 |
|---|---|---|
| 1 | 戦闘エンジン `packages/core/src/battle/` | **完了・main にマージ済み** |
| 2 | 育成 `packages/core/src/progression/` | **完了・main にマージ済み** |
| 3a | 日次ロジック `packages/core/src/daily/` | **完了・main にマージ済み** |
| 3b | サーバ基盤 `apps/worker/` | **計画まで完了。実装は未着手** |
| 3c | 戦闘API・報酬 | 未着手（計画も無い） |
| 4 | 画面・永続化のUI | 未着手（計画も無い） |

## いまの状態

- テスト **330件**、typecheck クリーン、CI 緑
- `packages/core` は実行時依存ゼロ、乱数は `daily/` のシード付き純関数のみ
- **まだ遊べない。** 画面もサーバも無い。動くのはエンジンだけ
- リポジトリ: https://github.com/kiyoshiw0128-web/minna-quest （public）

## 次の一手

段階3bの実装。計画は書けているので、サブエージェント方式で7タスク回すだけ。

計画: `docs/superpowers/plans/2026-09-04-worker-d1.md`
仕様: `docs/superpowers/specs/2026-09-04-worker-d1-design.md`

## 書類の置き場所

| 何 | どこ |
|---|---|
| 全体の設計 | `docs/superpowers/specs/2026-09-03-minna-quest-design.md` |
| 段階3bの設計 | `docs/superpowers/specs/2026-09-04-worker-d1-design.md` |
| 各段階の実装計画 | `docs/superpowers/plans/` |
| 積み残し | `docs/deferred.md` |

## よく使うコマンド

```bash
corepack pnpm --filter @mq/core test
corepack pnpm --filter @mq/core typecheck
```

## 踏みやすい地雷

- **`data/events.ts` は追記のみ。** 削除や並べ替えをすると過去の日の3択が変わる
- **`closeDay` に `daySeed` を渡さない。** タイブレークは `voteSeed`。型が同じなので防げない
- **`packages/core/tsconfig.json` に `noEmit` が無い。** 素の `tsc` を走らせるとソースの隣に生成物を吐く
