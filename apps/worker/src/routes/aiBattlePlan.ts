import type { BattlePlan, Enemy, PartyMember } from '@mq/core';
import { requirePlayer, sha256Hex } from '../auth.js';
import { suggestBattlePlan } from '../aiBattlePlan.js';
import type { Env } from '../env.js';
import { fail, ok } from '../respond.js';
import { handleGetBattle } from './battle.js';

type Body = { dayNo?: unknown };
type BattleEnvelope = { ok: true; data: BattleData } | { ok: false; error: string };
type BattleData = {
  dayNo: number;
  hasBattle: boolean;
  enemy?: Enemy;
  party?: PartyMember[];
};

export async function handleAiBattlePlan(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return fail('invalid JSON body');
  }
  const dayNo = typeof body.dayNo === 'number' && Number.isInteger(body.dayNo) ? body.dayNo : undefined;
  const url = new URL('/api/battle', request.url);
  if (dayNo !== undefined) url.searchParams.set('dayNo', String(dayNo));
  const battleResponse = await handleGetBattle(new Request(url, { headers: request.headers }), env);
  const envelope = await battleResponse.json() as BattleEnvelope;
  if (!envelope.ok) return fail(envelope.error, battleResponse.status);
  const battle = envelope.data;
  if (!battle.hasBattle || !battle.enemy || !battle.party) return fail('no battle today');

  const fingerprint = await sha256Hex(JSON.stringify({ enemy: battle.enemy, party: battle.party }));
  const cached = await env.DB.prepare(
    'SELECT plan, confidence FROM ai_battle_plans WHERE player_id = ? AND day_no = ? AND fingerprint = ?',
  ).bind(player.id, battle.dayNo, fingerprint).first<{ plan: string; confidence: number | null }>();
  if (cached) {
    return ok({
      plan: JSON.parse(cached.plan) as BattlePlan,
      source: 'jev' as const,
      confidence: cached.confidence,
      cached: true,
    });
  }

  const suggestion = await suggestBattlePlan(battle.enemy, battle.party, env.TYPESAFE_API_KEY);
  if (suggestion.source === 'jev') {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ai_battle_plans
       (player_id, day_no, fingerprint, plan, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      player.id, battle.dayNo, fingerprint, JSON.stringify(suggestion.plan),
      suggestion.confidence, new Date().toISOString(),
    ).run();
  }
  return ok({ ...suggestion, cached: false });
}
