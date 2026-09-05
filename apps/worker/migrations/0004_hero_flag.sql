-- パーティ操作（並べ替え・解雇）が「主人公を外せない」を守るには、
-- スロット位置ではなく個体そのものに主人公かどうかの印が要る。
-- 並び替えでslotは自由に変わるため、slot=0を主人公扱いにすると
-- 並び替え直後にただの雇用メンバーが「外せない主人公」になってしまう。
ALTER TABLE characters ADD COLUMN is_hero INTEGER NOT NULL DEFAULT 0;
