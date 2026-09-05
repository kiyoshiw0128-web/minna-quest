import { equipActive, equipPassive } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { getCharacterForPlayer, setEquipment } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type EquipBody = { characterId?: unknown; activeIds?: unknown; passiveIds?: unknown };

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null;
}

/**
 * アクティブ6枠・パッシブ2枠を1回のリクエストで両方受ける（設計書 §4）。
 * 片方ずつにすると、後半が失敗したときに「アクティブだけ変わった」状態が
 * 残ってしまうため、判定は両方成功して初めてDBに書く。
 */
export async function handleEquip(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: EquipBody;
  try {
    body = (await request.json()) as EquipBody;
  } catch {
    return fail('invalid JSON body');
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const activeIds = toStringArray(body.activeIds);
  const passiveIds = toStringArray(body.passiveIds);
  if (characterId === '' || activeIds === null || passiveIds === null) {
    return fail('characterId, activeIds and passiveIds are required');
  }

  const found = await getCharacterForPlayer(env.DB, player.id, characterId);
  if (found === null) return fail('character not found', 404);

  const activeResult = equipActive(found.character, activeIds);
  if (!activeResult.ok) return fail(activeResult.reason);

  // パッシブの判定は、アクティブ変更後のCharacterに対して行う。
  // 学習済みかどうかの判定材料（learnedPassives）はアクティブの変更で
  // 変わらないため実質的な違いは無いが、equippedActiveの整合を保った
  // 状態に対して次の判定を積み重ねる、というcore関数の使い方に揃える。
  const passiveResult = equipPassive(activeResult.character, passiveIds);
  if (!passiveResult.ok) return fail(passiveResult.reason);

  const applied = await setEquipment(env.DB, player.id, characterId, activeIds, passiveIds);
  if (!applied) return fail('character not found', 404);

  return ok({ characterId, activeIds, passiveIds });
}
