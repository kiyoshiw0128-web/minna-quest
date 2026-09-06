import { EQUIPMENT, equipItem } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { getCharacterForPlayer, setCharacterEquipmentItems } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type EquipItemBody = { characterId?: unknown; weaponId?: unknown; armorId?: unknown };

/** unset(undefined)は「触らない」ではなく、この画面は毎回両方を送る前提（設計書 §6）で null 固定。 */
function toIdOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

/**
 * 武器・防具を装備する（設計書 §6 `POST /api/equip-item`）。
 *
 * job.ts と同じ形。`getCharacterForPlayer` が player_id をWHEREに含めて
 * 読むので、他人のcharacterIdを渡された時点でnullになり、以降のcoreロジックにも
 * 書き込みにも進まない（設計書 §8 テスト6）。
 *
 * 存在確認・スロット確認は core の equipItem に任せ、「持っているか」
 * 「所持数を超えていないか」（設計書 §8 テスト4・テスト5）は
 * setCharacterEquipmentItems 内のSQLに任せる。ここでは両方の結果を
 * 順につなぐだけ。
 */
export async function handleEquipItem(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: EquipItemBody;
  try {
    body = (await request.json()) as EquipItemBody;
  } catch {
    return fail('invalid JSON body');
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const weaponId = toIdOrNull(body.weaponId);
  const armorId = toIdOrNull(body.armorId);
  if (characterId === '' || weaponId === undefined || armorId === undefined) {
    return fail('characterId, weaponId and armorId are required');
  }

  const found = await getCharacterForPlayer(env.DB, player.id, characterId);
  if (found === null) return fail('character not found', 404);

  const result = equipItem(found.character, weaponId, armorId, EQUIPMENT);
  if (!result.ok) return fail(result.reason);

  const applied = await setCharacterEquipmentItems(env.DB, player.id, characterId, weaponId, armorId);
  if (!applied) return fail('item not owned or already equipped elsewhere');

  return ok({ characterId, weaponId, armorId });
}
