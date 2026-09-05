import { PETS } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { setActivePet } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type PetBody = { petId?: unknown };

/**
 * 連れているペットを替える（段階6・設計書 §5）。
 *
 * 持っていないペットは断る。`setActivePet` が「持っているか」と「書き込み」を
 * 同じSQLで確認するので、未所持のペットIDを渡しても players テーブルは
 * 一切変わらない（equip.ts の setEquipment と同じ考え方。設計書 §8 テスト4）。
 */
export async function handlePet(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: PetBody;
  try {
    body = (await request.json()) as PetBody;
  } catch {
    return fail('invalid JSON body');
  }

  const petId = typeof body.petId === 'string' ? body.petId : '';
  if (petId === '' || PETS[petId as keyof typeof PETS] === undefined) {
    return fail('unknown petId');
  }

  const applied = await setActivePet(env.DB, player.id, petId);
  if (!applied) return fail('pet not owned', 403);

  return ok({ activePetId: petId });
}
