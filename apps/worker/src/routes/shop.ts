import { EQUIPMENT } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

/**
 * 店の品揃え（設計書 §6 `GET /api/shop`）。
 *
 * 酒場（tavern.ts）と違い日替わりにしない。全員が同じ品揃えを見る。
 * 装備は「欲しいものを貯めて買う」ものなので、日替わりだと計画できない
 * （設計書 §6）。マスタ（@mq/core の EQUIPMENT）をそのまま返すだけで足りる。
 */
export async function handleShop(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  return ok({ items: Object.values(EQUIPMENT) });
}
