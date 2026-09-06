import { learnsAt } from './job.js';
import type { Job } from './job.js';
import { applyLearns } from './exp.js';
import type { JobTable } from './exp.js';
import type { Aptitude, Character, JobId } from './types.js';

export type JobChangeError = 'unknownJob' | 'locked' | 'alreadyCurrent';

/** その職業に就ける条件を満たしているか。条件が空なら常に true。 */
export function isUnlocked(character: Character, job: Job): boolean {
  return job.requires.every(
    (requirement) => (character.jobs[requirement.jobId]?.level ?? 0) >= requirement.level,
  );
}

/** いま就ける職業のID。表に載っている順で返す。 */
export function unlockedJobs(character: Character, jobs: JobTable): readonly JobId[] {
  return Object.values(jobs)
    .filter((job) => isUnlocked(character, job))
    .map((job) => job.id);
}

export function canChangeJob(
  character: Character,
  jobId: JobId,
  jobs: JobTable,
): 'ok' | JobChangeError {
  const job = jobs[jobId];
  if (!job) return 'unknownJob';
  if (character.currentJob === jobId) return 'alreadyCurrent';
  if (!isUnlocked(character, job)) return 'locked';
  return 'ok';
}

/**
 * 転職する。冒険レベル・習得済み・装備・他の職業の進み具合は一切変わらない。
 * 初めて就く職業だけ { level: 1, exp: 0 } で追加される。
 */
export function changeJob(
  character: Character,
  jobId: JobId,
  jobs: JobTable,
): { ok: true; character: Character } | { ok: false; reason: JobChangeError } {
  const verdict = canChangeJob(character, jobId, jobs);
  if (verdict !== 'ok') return { ok: false, reason: verdict };

  const job = jobs[jobId];
  const firstTime = character.jobs[jobId] === undefined;

  const moved: Character = {
    ...character,
    currentJob: jobId,
    jobs: firstTime ? { ...character.jobs, [jobId]: { level: 1, exp: 0 } } : character.jobs,
  };

  // 初めて就いた職業は、その場でレベル1の習得が起きる。
  // これが無いと転職直後のキャラが技を持たない。
  const learned = firstTime ? applyLearns(moved, learnsAt(job, 1)).character : moved;

  return { ok: true, character: learned };
}

/**
 * キャラを新しく作る。主人公も雇用メンバーも同じ関数で作る。
 * 初期職のレベル1の習得をここで済ませ、そのまま装備もしておく。
 * キャラはレベル1から始まるので、レベルアップ時の習得だけでは
 * 初期職のレベル1の技が永久に手に入らない。
 */
export function createCharacter(
  params: { id: string; name: string; aptitude: Aptitude; job: JobId },
  jobs: JobTable,
): Character {
  const job = jobs[params.job];
  if (!job) throw new Error(`unknown job: ${params.job}`);

  const blank: Character = {
    id: params.id,
    name: params.name,
    adventureLevel: 1,
    adventureExp: 0,
    aptitude: params.aptitude,
    currentJob: params.job,
    jobs: { [params.job]: { level: 1, exp: 0 } },
    learnedSkills: [],
    learnedPassives: [],
    equippedActive: [],
    equippedPassive: [],
    equippedWeapon: null,
    equippedArmor: null,
  };

  const learned = applyLearns(blank, learnsAt(job, 1)).character;

  // 習得済みと装備は別々に動くリストなので、同じ配列オブジェクトを
  // 共有させずに複製しておく。
  return {
    ...learned,
    equippedActive: [...learned.learnedSkills],
    equippedPassive: [...learned.learnedPassives],
  };
}
