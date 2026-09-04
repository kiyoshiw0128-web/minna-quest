-- players.gold: 金貨はプレイヤー単位で持つ。キャラ単位にすると、雇用の原資を
-- どのキャラが持つかという問いが生まれて、得るものが無い（設計書 §3）。
ALTER TABLE players ADD COLUMN gold INTEGER NOT NULL DEFAULT 0;

-- キャラクター本体。主人公も雇用メンバーも同じ行の形（設計書 §3.1 / §5）。
-- 装備枠（equipped_active/equipped_passive）は learned と分けて持つ。
-- 習得は永久・装備は付け替えるものなので、同じ列に混ぜると意味が変わってしまう。
CREATE TABLE characters (
  id               TEXT PRIMARY KEY,
  player_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  adventure_level  INTEGER NOT NULL,
  adventure_exp    INTEGER NOT NULL,
  aptitude         TEXT NOT NULL,
  current_job      TEXT NOT NULL,
  equipped_active  TEXT NOT NULL,
  equipped_passive TEXT NOT NULL
);

-- 二階建ての要（設計書 §3）。就いたことのある職業ごとに1行。
-- 転職しても消えないので、同じキャラが複数の職業を持てるように
-- character_id 単体ではなく (character_id, job_id) を主キーにする。
CREATE TABLE job_levels (
  character_id TEXT NOT NULL,
  job_id       TEXT NOT NULL,
  level        INTEGER NOT NULL,
  exp          INTEGER NOT NULL,
  PRIMARY KEY (character_id, job_id)
);

-- 習得済みのスキル・パッシブ。kind で技表とパッシブ表のどちらのIDかを区別する。
-- 転職しても永久に消えないので、装備枠（characters側）とは別テーブルにしてある。
CREATE TABLE learned (
  character_id TEXT NOT NULL,
  kind         TEXT NOT NULL,
  id           TEXT NOT NULL,
  PRIMARY KEY (character_id, kind, id)
);

-- パーティの並び。枠の並びがそのまま戦闘の並びになる（設計書 §3.2）。
-- (player_id, slot) を主キーにすることで、同じ枠に2人入る事故を
-- DBの制約自体で防ぐ。雇用の空き枠探しはこの制約に守られて安全にできる。
CREATE TABLE party (
  player_id    TEXT NOT NULL,
  character_id TEXT NOT NULL,
  slot         INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);

CREATE INDEX idx_characters_player ON characters (player_id);
CREATE INDEX idx_job_levels_character ON job_levels (character_id);
CREATE INDEX idx_learned_character ON learned (character_id);
CREATE INDEX idx_party_character ON party (character_id);
