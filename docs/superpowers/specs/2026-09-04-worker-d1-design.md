# サーバ基盤（段階3b） 設計書

作成日: 2026-09-04
ステータス: 設計確定・実装計画待ち
親仕様: `docs/superpowers/specs/2026-09-03-minna-quest-design.md`（2章と5.2、7章）

## 1. この段階で作るもの

「毎日みんなが投票して、多数決で世界のルートが決まる」を、**実際に時間が進む形で**動かす。
段階3aで純関数として書いた判断（締める、集計する、フラグを畳む、3択を引く）に、
永続化と時刻と認証を与える。

**動くようになること:**
- 招待コードを配ると、身内が参加してプレイヤーになれる
- 各自が今日の3択を見て投票できる
- JST 05:00 に cron が締め、多数決でルートが決まり、翌日の3択が用意される
- 締め処理が失敗して二重に走っても、世界は二重に進まない
- 何日か cron が止まっても、次に動いたとき古い日から順に取り戻す

**まだできないこと:** 画面が無いので人間は遊べない。API を直接叩けば動作は確認できる。

## 2. この段階の範囲

### 含むもの

- D1 のスキーマとマイグレーション
- 招待コードによる参加とトークン認証
- JST 基準の「今日が何日目か」
- Cron Trigger による締めと、複数日の取り戻し
- 投票と取得の API（4本）
- Cloudflare へのデプロイ

### 含まないもの

- **戦闘エンドポイント**（`plan` を POST して `BattleLog` を返す）と報酬の付与。
  報酬の量を決める必要があり、バランス調整が入るため別計画にする
- **雇用・転職・装備の API。** 段階4の画面が必要とする面だが、投票が動くことと独立
- **画面と静的配信。** 段階4。3bは API だけをデプロイし、ルートは404を返す
- **キャラクターの永続化。** 投票にキャラは要らない。戦闘の段階で足す

## 3. 制約の変更

段階1〜3aの「実行時依存ゼロ」と「`Math.random` / `Date.now` / `crypto` 禁止」は
**`packages/core` の中だけの規律**として続く。`apps/worker` には次が入る。

- `wrangler`、`@cloudflare/workers-types`、`@cloudflare/vitest-pool-workers`
- `crypto`（トークン生成とハッシュ）。ここは予測不能であるべき場所なので、
  禁止の理由（決定論）が当てはまらない
- `Date`（現在時刻の取得）。ただし**時刻を受け取って判断する部分は純関数として
  `packages/core` に置く**ので、日付境界のロジックは実機なしでテストできる

`packages/core` は引き続き依存ゼロを保つ。CI の型検査がこれを守る。

## 4. データ

### 4.1 テーブル

```sql
CREATE TABLE worlds (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  started_at   TEXT NOT NULL,   -- ISO8601。ここから何日目かを数える
  current_day  INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  tags         TEXT NOT NULL,   -- JSON配列。獲得済みフラグ
  created_at   TEXT NOT NULL
);

CREATE TABLE world_days (
  world_id   TEXT NOT NULL,
  day_no     INTEGER NOT NULL,
  option_ids TEXT NOT NULL,     -- JSON配列。その日の3択
  chosen_id  TEXT,              -- NULL なら未締め
  counts     TEXT,              -- JSON。締めるまで NULL
  tiebroken  INTEGER,           -- 0/1。締めるまで NULL
  closed_at  TEXT,
  PRIMARY KEY (world_id, day_no)
);

CREATE TABLE votes (
  world_id  TEXT NOT NULL,
  day_no    INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  voted_at  TEXT NOT NULL,
  PRIMARY KEY (world_id, day_no, player_id)
);

CREATE TABLE players (
  id         TEXT PRIMARY KEY,
  world_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  joined_at  TEXT NOT NULL
);

CREATE TABLE invites (
  code_hash  TEXT PRIMARY KEY,
  world_id   TEXT NOT NULL,
  used_by    TEXT,              -- NULL なら未使用
  created_at TEXT NOT NULL,
  used_at    TEXT
);
```

### 4.2 主キーが規則を守る

`votes` の主キーが `(world_id, day_no, player_id)` であることが効く。
投票し直しは UPSERT になるので、**「同じ人の最後の1票だけ数える」がDBの形として
保証される。** アプリのコードがその規則を忘れても壊れない。

### 4.3 締めは1本の UPDATE

```sql
UPDATE world_days
   SET chosen_id = ?, counts = ?, tiebroken = ?, closed_at = ?
 WHERE world_id = ? AND day_no = ? AND chosen_id IS NULL
```

`WHERE chosen_id IS NULL` が冪等性そのもの。二重に走った2回目は **0行更新**で終わる。
4列を1文で書くので、`chosen_id` だけ入って `counts` が NULL という半端な行は
原理的に作れない。段階3aのレビューが「D1が列を非原子的に書けば到達しうる」と
指摘した状態を、スキーマの側で潰す。

**更新行数を見て分岐する。** 1行なら締められた、0行ならすでに誰かが締めていた。
後者はエラーではなく正常な結果として扱う。

### 4.4 マイグレーション

`wrangler d1 migrations` を使う。`apps/worker/migrations/0001_init.sql` から始める。
スキーマ変更は必ず新しい番号のファイルで行い、既存のファイルは書き換えない。

## 5. 時刻と日数

**「今日が何日目か」は Worker が JST で決める。** 端末の時計は一切見ない。

判断そのものは純関数として `packages/core/src/daily/` に置く:

```ts
/** JST の日付境界で、開始日から数えて何日目かを返す。1日目から始まる。 */
jstDayNumber(startedAt: string, now: Date): number
```

Worker は `new Date()` を渡すだけ。テストは任意の時刻を渡せるので、
**日付境界の挙動を実機なしで検証できる。** JST の 04:59 と 05:00、
月をまたぐ日、うるう年を純粋なテストで固定する。

cron の設定は UTC で書く。JST 05:00 は UTC 20:00 なので `0 20 * * *`。
サマータイムは日本に無いので固定でよい。

## 6. 締めと取り戻し

**締める対象は「今日より前の、まだ締めていない日」すべて。**
`jstDayNumber` が返す今日の日数を `today` として、`day_no < today` かつ
`chosen_id IS NULL` の行が対象になる。今日そのものはまだ投票を受け付けている
最中なので締めない。

cron が起きたら、対象が無くなるまで次を繰り返す。

1. 対象のうち**最も古い日**を取る。無ければ終了
2. その日の票を読む
3. `closeDay`（core の純関数）で勝った選択肢を決める
4. 4.3 の UPDATE を実行する。0行なら他が締めた後なので次へ
5. 選ばれたイベントの結果を `applyOutcome`（core）で `worlds.tags` に畳む
6. `pickEvents`（core）で翌日の3択を引き、`world_days` に新しい行を作る
7. `worlds.current_day` を今開いた日に、`chapter` を `chapterOf` の結果に更新する

**判断は全部 core の純関数で、Worker は SQL を呼ぶだけ。** この分け方により、
取り戻しの順序と冪等性は素の vitest で検証でき、実機テストは
「SQLが本当にそう動くか」だけを確かめればよくなる。

**1日ずつ処理する。** まとめて処理しないのは、途中で失敗したときに
どこまで進んだかがDBに残るようにするため。次の起動が続きから再開する。

## 7. 認証

### 7.1 招待コード

**1人1枚、使い切り。** コードは128ビットの乱数を文字列にしたもの。
総当たりが現実的でないので、レート制限を置かずに守れる。

DBに入るのは**コードのハッシュだけ**。平文は発行時にあなたの手元にしか残らない。

発行に管理画面は作らない。`wrangler d1 execute` で流し込むスクリプトを1本置く。
**管理エンドポイントを持たないことが、一番小さい攻撃面になる。**

### 7.2 参加とトークン

`POST /api/join` にコードと名前を送ると、コードのハッシュが未使用の招待に
一致すれば、プレイヤーを作ってトークンを返す。招待は同じトランザクションで
使用済みにする。

トークンも128ビットの乱数で、DBには**ハッシュだけ**を保存する。
以降のリクエストは `Authorization: Bearer <token>` で認証する。

ブラウザ側の保存は段階4の仕事。

## 8. API

4本だけ。返り値は封筒に統一する。

```
{ "ok": true,  "data": ... }
{ "ok": false, "error": "..." }
```

| メソッド | パス | 入力 | 出力 |
|---|---|---|---|
| POST | `/api/join` | `{ code, name }` | `{ token, player }` |
| GET | `/api/today` | | 今日の3択、自分の投票、締め済みなら結果 |
| POST | `/api/vote` | `{ optionId }` | 受理 |
| GET | `/api/world` | | 世界の進行度と過去の日の一覧 |

`/api/join` 以外はトークンを要求する。

### 8.1 票数は締めるまで返さない

仕様書5.4の「先に見えると後から投票する人が流される」を、**サーバ側に埋め込む。**
`chosen_id` が NULL の日は `counts` を返さない。クライアントを信用する設計にしない。

### 8.2 入力の検証

`optionId` はその日の `option_ids` に含まれるものだけを受け付ける。
含まれないものは 400 を返す。集計側（`tallyVotes`）も無効票を無視するので
二重に守られるが、境界で弾くほうが原因が分かりやすい。

## 9. テスト

**2層に分ける。**

### 純ロジック（素の vitest、`packages/core`）

- `jstDayNumber` の日付境界（04:59 と 05:00、月またぎ、うるう年）
- 取り戻しの順序（締めていない日が複数あるとき古い順に並ぶ）
- 既存の `closeDay` / `applyOutcome` / `pickEvents` はすでに覆われている

### 実機（`@cloudflare/vitest-pool-workers`、`apps/worker`）

偽物では絶対に見つからない部分だけ、5本。

1. 招待コードで参加するとトークンが返り、同じコードは二度使えない
2. 投票し直しが UPSERT で上書きになる
3. cron を2回走らせても世界が二重に進まない（4.3 の UPDATE が0行を返す）
4. 締めていない日が3日溜まった状態で cron を1回走らせると、古い順に3日分進む
5. 締める前は `/api/today` が票数を返さない

## 10. デプロイ

- D1 データベースを作り、`wrangler.toml` にバインドする
- マイグレーションを適用する
- 世界を1つ投入する。このとき**1日目の `world_days` 行も同時に作る**。
  cron は既存の行を締めて次を開く作りなので、最初の1行が無いと何も始まらない。
  1日目の3択は `pickEvents` を `daySeed(worldId, 1)` で引いたものにする
- 招待コードを人数分、スクリプトで投入する
- Worker をデプロイする
- cron が翌朝実際に動いたことをログで確認する

**ロールバックは D1 のマイグレーションを戻す形にはしない。** 前方向のみ。
壊れたら新しいマイグレーションで直す。身内向けの規模でロールバック機構を
作るのは過剰であり、複雑さのほうが危ない。

## 11. 意図的に採らなかった選択肢

- **管理エンドポイントで招待コードを発行する** — 攻撃面が増える。スクリプトで足りる
- **全テストを実機で回す** — 330テストが1秒で終わる速さを捨てることになる
- **D1 をインターフェースで抽象化し偽物だけでテストする** — SQLと cron の配線という
  一番壊れやすい2つが未検証になる
- **レート制限** — コードが128ビットなら総当たりは現実的でない。身内向けに過剰
- **セッションの有効期限** — 身内向けで、失効させたければ行を消せばよい
- **複数世界の同時運用** — スキーマは world_id を持つので将来足せるが、
  今は1世界だけを作る
