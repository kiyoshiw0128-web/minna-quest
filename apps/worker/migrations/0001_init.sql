CREATE TABLE worlds (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  current_day  INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  tags         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE world_days (
  world_id   TEXT NOT NULL,
  day_no     INTEGER NOT NULL,
  option_ids TEXT NOT NULL,
  chosen_id  TEXT,
  counts     TEXT,
  tiebroken  INTEGER,
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
  used_by    TEXT,
  created_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX idx_world_days_open ON world_days (world_id, day_no) WHERE chosen_id IS NULL;
CREATE INDEX idx_votes_day ON votes (world_id, day_no);
