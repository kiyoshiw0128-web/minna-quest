-- 報酬の配布記録とは分離し、冒険の結果から戦闘を読み返す。
-- 勝利後の再挑戦で勝利ログを失わない。敗北は最新の試行を保存する。
CREATE TABLE battle_reports (
  world_id TEXT NOT NULL,
  day_no INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  report TEXT NOT NULL,
  PRIMARY KEY (world_id, day_no, player_id),
  FOREIGN KEY (world_id, day_no) REFERENCES world_days(world_id, day_no) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
