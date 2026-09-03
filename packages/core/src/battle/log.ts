import type { Effect } from './effects.js';

export type BattleResult = 'win' | 'lose' | 'timeout';

export type SkipReason = 'noMp' | 'cooldown' | 'stunned' | 'noAction';

/** 戦闘中に起きたことの記録。フロントはこれを再生するだけでよい。 */
export type BattleEvent =
  | { t: 'turnStart'; turn: number }
  | { t: 'act'; actorId: string; skillId: string }
  | { t: 'damage'; targetId: string; amount: number; hpAfter: number }
  | { t: 'heal'; targetId: string; amount: number; hpAfter: number }
  | { t: 'effect'; targetId: string; effect: Effect }
  | { t: 'expire'; targetId: string; effect: Effect }
  | { t: 'skip'; actorId: string; reason: SkipReason }
  | { t: 'enrage'; actorId: string }
  | { t: 'down'; actorId: string }
  | { t: 'end'; result: BattleResult; turns: number };

export type BattleLog = {
  result: BattleResult;
  turns: number;
  events: BattleEvent[];
};
