-- その日の戦闘の結果。挑戦回数は記録しない（何度でも挑み直せる設計のため。
-- 設計書 §6.2）。ここに残るのは「勝った」という事実と、報酬を配ったかどうかだけ。
-- 負けた・タイムアウトした試行はそもそも行を作らない。
--
-- PRIMARY KEY (world_id, day_no, player_id) が「同じ日に同じプレイヤーの
-- 勝利記録は1つだけ」を保証する。rewarded_at が入っていれば報酬は配布済みで、
-- store.ts の recordBattleWin はこの行が無いことをガードにして報酬の文を並べる
-- （既存の advanceDay と同じ、締めの文より前にEXISTS/NOT EXISTSを置く形）。
CREATE TABLE battle_results (
  world_id    TEXT NOT NULL,
  day_no      INTEGER NOT NULL,
  player_id   TEXT NOT NULL,
  result      TEXT NOT NULL,
  rewarded_at TEXT NOT NULL,
  PRIMARY KEY (world_id, day_no, player_id)
);

-- その日の戦闘に最初に勝ったプレイヤーのID（設計書 §6.3）。全員が一団の仲間
-- という設定に基づき、誰か1人が倒せば世界としては討伐済みになる。
-- NULL のままなら誰もまだ勝っていない。UPDATE ... WHERE defeated_by IS NULL
-- で守るので、同じ日に複数人が勝っても最初の1人のまま動かない。
ALTER TABLE world_days ADD COLUMN defeated_by TEXT;
