import { changeJob, JOBS } from '@mq/core';
import { requirePlayer } from '../auth.js';
import { changeCharacterJob, getCharacterForPlayer } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type JobBody = { characterId?: unknown; jobId?: unknown };

/** core の JobChangeError を人が読める理由文に変換する。 */
function reasonMessage(reason: 'unknownJob' | 'locked' | 'alreadyCurrent'): string {
  switch (reason) {
    case 'unknownJob':
      return 'unknown job';
    case 'locked':
      return 'job not unlocked';
    case 'alreadyCurrent':
      return 'already this job';
  }
}

/**
 * 転職する。判定は core の canChangeJob / changeJob に任せ、サーバ側では
 * 条件を一切書き直さない（設計書 §3）。雇用メンバーも主人公も同じCharacter型
 * なので特別扱いしない。
 *
 * `getCharacterForPlayer` がWHERE句に player_id を含めて読むので、
 * 他人のcharacterIdを渡された時点でnullになり、coreロジックにも書き込みにも
 * 進まない（設計書 §8 テスト10）。
 */
export async function handleJob(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
  if (player === null) return fail('unauthorized', 401);

  let body: JobBody;
  try {
    body = (await request.json()) as JobBody;
  } catch {
    return fail('invalid JSON body');
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (characterId === '' || jobId === '') return fail('characterId and jobId are required');

  const found = await getCharacterForPlayer(env.DB, player.id, characterId);
  if (found === null) return fail('character not found', 404);

  const result = changeJob(found.character, jobId, JOBS);
  if (!result.ok) return fail(reasonMessage(result.reason));

  // 初めて就く職業だけ job_levels に新しい行が要る。既存の職業に戻る場合は
  // 保たれているジョブレベルに一切触らない（設計書 §3・冒険レベルと同じ二階建ての原則）。
  const firstTime = found.character.jobs[jobId] === undefined;
  const newJobLevel = firstTime ? (result.character.jobs[jobId] ?? { level: 1, exp: 0 }) : null;

  const newSkillIds = result.character.learnedSkills.filter(
    (id) => !found.character.learnedSkills.includes(id),
  );
  const newPassiveIds = result.character.learnedPassives.filter(
    (id) => !found.character.learnedPassives.includes(id),
  );

  const applied = await changeCharacterJob(env.DB, {
    characterId,
    playerId: player.id,
    jobId,
    newJobLevel,
    newSkillIds,
    newPassiveIds,
  });
  if (!applied) return fail('character not found', 404);

  return ok({
    characterId,
    jobId,
    jobLevel: result.character.jobs[jobId]?.level ?? 1,
    newSkillIds,
    newPassiveIds,
  });
}
