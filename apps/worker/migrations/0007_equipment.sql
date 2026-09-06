-- 装備（段階8・設計書 §3・§6）。武器1・防具1の枠をcharactersに足す。
-- equipped_active/equipped_passiveと同じ考え方で、NULL可＝未装備。
ALTER TABLE characters ADD COLUMN equipped_weapon TEXT;
ALTER TABLE characters ADD COLUMN equipped_armor TEXT;

-- 買った装備の所持記録。player_petsと違って複数行持てる（設計書 §6 —
-- 「同じitem_idを複数行持てる。2本買えば2人に装備できる」）ため、
-- (player_id, item_id) を主キーにはできない。連番のidだけを主キーにする。
CREATE TABLE player_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  obtained_at TEXT NOT NULL
);

-- 所持数の集計（何個持っているか）と、装備できるかの判定の両方で
-- (player_id, item_id) を条件に引くので、その2列にインデックスを張る。
CREATE INDEX idx_player_items_player_item ON player_items (player_id, item_id);
