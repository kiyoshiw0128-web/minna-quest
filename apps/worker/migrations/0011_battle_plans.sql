-- NULL means use the character's default attack until a turn order is saved.
ALTER TABLE characters ADD COLUMN battle_turns TEXT;
