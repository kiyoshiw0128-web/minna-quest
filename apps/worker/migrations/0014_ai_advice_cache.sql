CREATE TABLE ai_advice_cache (
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, kind, fingerprint),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
