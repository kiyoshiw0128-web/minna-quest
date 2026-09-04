import type { StatBlock } from '../battle/types.js';
import type { JobId } from './types.js';

/** 上級職の解禁条件。すべて満たすと就ける。 */
export type JobRequirement = { jobId: JobId; level: number };

/** ジョブレベル1つあたりのステータス補正。 */
export type JobStatBonus = Partial<Readonly<Record<keyof StatBlock, number>>>;

/** そのジョブレベルに到達したときに覚えるもの。 */
export type LearnEntry =
  | { level: number; kind: 'skill'; id: string }
  | { level: number; kind: 'passive'; id: string };

export type Job = {
  id: JobId;
  name: string;
  tier: 'basic' | 'advanced';
  statBonus: JobStatBonus;
  learnset: readonly LearnEntry[];
  /** 空なら最初から就ける。上級職だけが条件を持つ */
  requires: readonly JobRequirement[];
};

/** そのジョブレベルちょうどで覚えるものを返す。 */
export function learnsAt(job: Job, level: number): readonly LearnEntry[] {
  return job.learnset.filter((entry) => entry.level === level);
}
