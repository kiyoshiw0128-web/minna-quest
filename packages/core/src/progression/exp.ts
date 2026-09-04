import {
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
  adventureExpToNext,
  jobExpToNext,
} from './curve.js';
import { learnsAt } from './job.js';
import type { Job, LearnEntry } from './job.js';
import type { Character, JobId, JobProgress, ProgressEvent } from './types.js';

export type ExpGain = { adventure: number; job: number };

export type JobTable = Readonly<Record<JobId, Job>>;

/**
 * 経験値を与えてレベルアップと習得を解決する。
 * 一度に複数レベル上がることがあり、その途中で覚えるものも全部拾う。
 * 上限に達したら余った経験値は捨てる（溜め込んでも使い道がないため）。
 */
export function gainExp(
  character: Character,
  gain: ExpGain,
  jobs: JobTable,
): { character: Character; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];

  const adventure = advanceAdventure(character, gain.adventure, events);
  const job = advanceJob({ ...character, ...adventure }, gain.job, jobs, events);

  return { character: { ...character, ...adventure, ...job }, events };
}

/**
 * 習得表の項目をキャラに反映する。すでに覚えているものは足さない。
 * レベルアップからも転職からも呼ばれる。転職で新しい職業に就いたときに
 * レベル1の習得が起きないと、そのキャラは技を1つも持たないまま戦うことになる。
 */
export function applyLearns(
  character: Character,
  entries: readonly LearnEntry[],
): { character: Character; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];
  const skills = [...character.learnedSkills];
  const passives = [...character.learnedPassives];

  for (const entry of entries) {
    if (entry.kind === 'skill' && !skills.includes(entry.id)) {
      skills.push(entry.id);
      events.push({ t: 'skillLearned', skillId: entry.id });
    }
    if (entry.kind === 'passive' && !passives.includes(entry.id)) {
      passives.push(entry.id);
      events.push({ t: 'passiveLearned', passiveId: entry.id });
    }
  }

  return {
    character: { ...character, learnedSkills: skills, learnedPassives: passives },
    events,
  };
}

function advanceAdventure(
  character: Character,
  amount: number,
  events: ProgressEvent[],
): Pick<Character, 'adventureLevel' | 'adventureExp'> {
  let level = character.adventureLevel;
  let exp = character.adventureExp + amount;

  while (level < MAX_ADVENTURE_LEVEL && exp >= adventureExpToNext(level)) {
    exp -= adventureExpToNext(level);
    level += 1;
    events.push({ t: 'adventureLevelUp', level });
  }

  return { adventureLevel: level, adventureExp: level >= MAX_ADVENTURE_LEVEL ? 0 : exp };
}

function advanceJob(
  character: Character,
  amount: number,
  jobs: JobTable,
  events: ProgressEvent[],
): Pick<Character, 'jobs' | 'learnedSkills' | 'learnedPassives'> {
  const jobId = character.currentJob;
  const definition = jobs[jobId];
  // 表に無い職業は投げる。黙って進めると「レベルは上がるのに何も覚えない」
  // キャラができてしまい、原因（壊れたセーブデータの職業ID）から何層も
  // 離れたところで表面化する。bridge.ts / createCharacter / canChangeJob と
  // 同じ扱いに揃える。
  if (!definition) throw new Error(`unknown job: ${jobId}`);

  const current: JobProgress = character.jobs[jobId] ?? { level: 1, exp: 0 };

  let level = current.level;
  let exp = current.exp + amount;
  let learner = character;

  while (level < MAX_JOB_LEVEL && exp >= jobExpToNext(level)) {
    exp -= jobExpToNext(level);
    level += 1;
    events.push({ t: 'jobLevelUp', jobId, level });

    const learned = applyLearns(learner, learnsAt(definition, level));
    learner = learned.character;
    events.push(...learned.events);
  }

  return {
    jobs: {
      ...character.jobs,
      [jobId]: { level, exp: level >= MAX_JOB_LEVEL ? 0 : exp },
    },
    learnedSkills: learner.learnedSkills,
    learnedPassives: learner.learnedPassives,
  };
}
