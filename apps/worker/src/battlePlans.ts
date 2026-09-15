import { DEFAULT_MAX_TURNS, SKILLS } from '@mq/core';
import type { BattlePlan, Skill } from '@mq/core';

/** Removed skills fall back to a usable basic attack; explicit null remains a wait. */
export async function getSavedBattlePlan(db: D1Database, playerId: string): Promise<BattlePlan> {
  const rows = await db.prepare(`SELECT c.id, c.equipped_active, c.battle_turns FROM characters c
    JOIN party p ON p.character_id = c.id AND p.player_id = c.player_id
    WHERE c.player_id = ? ORDER BY p.slot`).bind(playerId)
    .all<{ id: string; equipped_active: string; battle_turns: string | null }>();
  return Object.fromEntries(rows.results.map((row) => {
    const active: string[] = JSON.parse(row.equipped_active);
    const basic = active.find((id) => {
      const skill: Skill | undefined = SKILLS[id as keyof typeof SKILLS];
      return skill && skill.mpCost === 0 && skill.cooldown === 0 && !skill.requiresPet;
    }) ?? active[0] ?? null;
    const saved: (string | null)[] | null = row.battle_turns === null ? null : JSON.parse(row.battle_turns);
    return [row.id, Array.from({ length: DEFAULT_MAX_TURNS }, (_, index) => {
      const id = saved?.[index];
      return id === null ? null : id !== undefined && active.includes(id) ? id : basic;
    })];
  }));
}
