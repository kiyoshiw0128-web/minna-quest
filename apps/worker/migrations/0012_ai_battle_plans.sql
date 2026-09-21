CREATE TABLE ai_battle_plans (
  player_id TEXT NOT NULL,
  day_no INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  plan TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, day_no, fingerprint),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
