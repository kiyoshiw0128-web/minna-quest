import type { Effect } from './effects.js';

export type BattleResult = 'win' | 'lose' | 'timeout';

/**
 * 行動できなかった理由。
 * - noAction     プランのその枠が空だった（意図的な「何もしない」）
 * - unknownSkill プランが指した技をそのキャラが持っていない（不正なプラン）
 */
export type SkipReason = 'noMp' | 'cooldown' | 'stunned' | 'noAction' | 'unknownSkill';

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
