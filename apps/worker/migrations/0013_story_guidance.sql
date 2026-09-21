ALTER TABLE world_days ADD COLUMN story_focus_id TEXT;
ALTER TABLE world_days ADD COLUMN story_guided INTEGER NOT NULL DEFAULT 0;

UPDATE world_days
   SET story_focus_id = json_extract(option_ids, '$[0]')
 WHERE chosen_id IS NULL;
