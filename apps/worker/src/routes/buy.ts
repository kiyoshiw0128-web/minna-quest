import { EQUIPMENT } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { buyItem, getPlayerGold } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type BuyBody = { itemId?: unknown };

/**
 * 装備を買う（設計書 §6 `POST /api/buy`）。金貨を払って手に入れる。
 *
 * hire.tsと同じ二段構え。事前チェック（gold不足の文言を出すため）は
 * TOCTOUを起こしうるが、実際の可否は `buyItem` 内のSQLがトランザクション内で
 * 独立に見る（設計書「買うことと金貨を払うことは片方だけ起きてはいけない」）。
 */
export async function handleBuy(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: BuyBody;
  try {
    body = (await request.json()) as BuyBody;
  } catch {
    return fail('invalid JSON body');
  }

  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  if (itemId === '') return fail('itemId is required');

  const item = EQUIPMENT[itemId as keyof typeof EQUIPMENT];
  if (item === undefined) return fail('unknown itemId');

  const gold = await getPlayerGold(env.DB, player.id);
  if (gold === null) return fail('player not found', 404);
  if (gold < item.cost) return fail('insufficient gold');

  const bought = await buyItem(env.DB, {
    playerId: player.id,
    itemId,
    cost: item.cost,
    obtainedAt: new Date().toISOString(),
  });
  if (!bought) {
    // 事前チェックと書き込みの間に競合していた場合（TOCTOU）。hire.tsと同じ考え方。
    const freshGold = await getPlayerGold(env.DB, player.id);
    if (freshGold !== null && freshGold < item.cost) return fail('insufficient gold');
    return fail('could not buy item');
  }

  return ok({ itemId, cost: item.cost });
}
