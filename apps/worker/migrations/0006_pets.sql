-- ペットの所持記録（段階6・設計書 §5）。世界の全員に配る仕組み（締めのバッチ）
-- なので、キーは (player_id, pet_id) の組にして、同じペットを重ねて配れない
-- ようにする（設計書 §8 テスト2）。advanceDay の INSERT ... SELECT ... WHERE
-- NOT EXISTS がこの主キーに守られて安全に「まだ持っていない人にだけ配る」を書ける。
CREATE TABLE player_pets (
  player_id   TEXT NOT NULL,
  pet_id      TEXT NOT NULL,
  obtained_at TEXT NOT NULL,
  PRIMARY KEY (player_id, pet_id)
);

CREATE INDEX idx_player_pets_player ON player_pets (player_id);

-- いま連れている1匹（設計書 §2 — 複数のペットを同時に連れることはしない）。
-- NULL可＝まだ一度もペットを持ったことがない、または（理論上）連れる先を
-- 外された状態。最初に手に入れた1匹は advanceDay が自動でここを埋める
-- （設計書 §5「最初に手に入れた1匹は自動で連れている状態にする」）。
ALTER TABLE players ADD COLUMN active_pet_id TEXT;
