import { requirePlayer } from '../auth.js';
import { getOwnedCharacterFlags, setPartyOrder } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type PartyBody = { order?: unknown };

/** パーティの枠は主人公込みで最大4（hire.tsのMAX_PARTY_SIZEと同じ制約）。 */
const MAX_PARTY_SIZE = 4;

/**
 * パーティの並びをまるごと置き換える（設計書 §5）。
 *
 * - 自分のキャラだけを指定できる：`getOwnedCharacterFlags` が返すのは
 *   このプレイヤーが持つキャラだけなので、そこに無いIDが1つでも混ざっていれば断る
 *   （設計書 §8 テスト10）。
 * - 主人公を外せない：主人公のIDが `order` に含まれているかをJS側で確認する。
 *   is_hero はスロット位置ではなく個体そのものの印なので、並べ替え後も
 *   確実に主人公を判別できる（0004_hero_flag.sqlのコメント参照）。
 */
export async function handleParty(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: PartyBody;
  try {
    body = (await request.json()) as PartyBody;
  } catch {
    return fail('invalid JSON body');
  }

  const order = Array.isArray(body.order) && body.order.every((id) => typeof id === 'string')
    ? (body.order as string[])
    : null;
  if (order === null) return fail('order is required');
  if (order.length === 0) return fail('order must not be empty');
  if (order.length > MAX_PARTY_SIZE) return fail('party cannot exceed 4 members');
  if (new Set(order).size !== order.length) return fail('duplicate characterId in order');

  const owned = await getOwnedCharacterFlags(env.DB, player.id);
  if (order.some((id) => !owned.has(id))) return fail('character not found', 404);

  const heroId = [...owned.entries()].find(([, isHero]) => isHero)?.[0];
  if (heroId !== undefined && !order.includes(heroId)) return fail('cannot remove hero from party');

  const applied = await setPartyOrder(env.DB, player.id, order);
  if (!applied) return fail('character not found', 404);

  return ok({ order });
}
