import type { BattleLog, Enemy, PartyMember } from '@mq/core';

export type BattleReport = {
  log: BattleLog;
  enemy: Enemy;
  party: readonly PartyMember[];
  rewarded: boolean;
};

export function battleReportStatement(db: D1Database, worldId: string, dayNo: number, playerId: string, report: BattleReport): D1PreparedStatement {
  return db.prepare(`INSERT INTO battle_reports (world_id, day_no, player_id, report)
    SELECT ?, ?, ?, ? WHERE NOT EXISTS (
      SELECT 1 FROM battle_results WHERE world_id = ? AND day_no = ? AND player_id = ?
    ) ON CONFLICT (world_id, day_no, player_id) DO UPDATE SET report = excluded.report
    WHERE json_extract(battle_reports.report, '$.log.result') != 'win'`)
    .bind(worldId, dayNo, playerId, JSON.stringify(report), worldId, dayNo, playerId);
}

export async function getBattleReport(db: D1Database, worldId: string, dayNo: number, playerId: string): Promise<BattleReport | null> {
  const row = await db.prepare('SELECT report FROM battle_reports WHERE world_id = ? AND day_no = ? AND player_id = ?')
    .bind(worldId, dayNo, playerId).first<{ report: string }>();
  return row ? JSON.parse(row.report) as BattleReport : null;
}
