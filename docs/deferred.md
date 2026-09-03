# 積み残し（段階1・戦闘エンジンから持ち越し）

段階1の実装とレビューで見つかったが、意図的に直さなかったもの。
いずれも段階2以降で該当箇所を触るときに一緒に片付ける。

## 設計に効くもの

**`BattleState` が `enraged` と `enragedTurn` の2つを持ち、不整合を表現できる。**
`enraged: true, enragedTurn: null` は型として作れてしまい、その場合は
激昂前と同じ絶対ターンでの行動表参照に静かに戻る。現状 `checkEnrage` が
唯一の書き手なので実際には起きないが、`enragedTurn !== null` を唯一の
真実にして `enraged` を導出すべき。

**`elementRateFor` が対象に関係なく `state.enemyDef.resist` を読む。**
敵が1体である間だけ正しい。`resist` を `Combatant` の生成時に持たせるほうがよい。
複数体の敵を出す前に直す。

**`nextEnemyAction` が負のインデックスを防いでいない。**
`state.turn < enragedTurn` の手組み state で `entry.skillId` が例外を投げる。
空テーブルの場合は `null` を返すので、そちらに揃えるべき。

**`Combatant.effects` が可変配列のまま。** マスタデータは readonly 化したが、
戦闘中の状態はまだ書き換え可能。

## テストの穴

- スタンによる行動スキップが `simulate` 経由で一度も通っていない
  （`SKILLS` にも `BALGOS` にもスタンを与える技が無い）
- `expire` イベントを `simulate` のレベルで検証していない
- パッシブが戦闘の結果を変えることを検証していない（存在の確認だけ）
- `tickAll` の走査元が `state.combatants`（更新前）。各IDを1回しか触らないので
  正しいが、その不変条件に依存している

## 仕組み

**CI が無い。** マスタデータの不変性は `@ts-expect-error` で守っているが、
これは `tsc` を走らせないと効かない。`vitest` は通ってしまう。
`pnpm -r typecheck` を回す CI を置くまで、この保証は手動実行頼み。

**formatter / linter の設定が無い。** ファイルが増える前に入れるほうが安い。

## 細かいもの

- `computeDamage` の `ratio` 分岐が `finalize` を再利用していない
  （上限の適用位置が違うので、そのままでは再利用できない）
- `pickLowestHp` の `reduce` に初期値が無い（直前で空配列を弾いているので正しい）
- `decide()` は相打ちのターンを `win` と判定する（意図的、コメント済み）
- `index.ts` が `ActionResult` を export していない
- コミットメッセージが1つだけ英語（`c632671`）。他はすべて日本語
- 仕様書 3.1 の「3ターン目に火力を全部ぶつける」は、バルゴスが最も遅いため
  実際には +50% の窓が4ターン目に来る点と噛み合っていない。
  同節の「溜め中の被ダメ +50% を狙って火力を置く」が正しい記述
