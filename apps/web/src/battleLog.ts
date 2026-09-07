import type { BattleEvent, BattleResult, Effect, SkipReason } from '@mq/core';

/** ターンごとにまとめた表示用の単位（設計書 §4.4「ターンごとにまとめて、順に表示する」）。 */
export type LogOutcome = {
  kind: BattleEvent['t'];
  target?: string;
  amount?: number;
  hpAfter?: number;
  text?: string;
};
export type LogEntry = { actorId?: string; skillId?: string; outcomes: LogOutcome[] };
export type TurnGroup = { turn: number; entries: LogEntry[] };

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  noMp: 'MP不足',
  cooldown: 'クールダウン中',
  stunned: 'スタン中',
  noAction: '何もしない',
  unknownSkill: '持っていない技',
  noPet: 'ペットを連れていない',
};

const RESULT_LABEL: Record<BattleResult, string> = {
  win: '勝利',
  lose: '敗北',
  timeout: '時間切れ',
};

/** 効果の中身を日本語1行にする。付与・失効の両方から呼ぶので値だけを組み立てる。 */
function describeEffect(effect: Effect): string {
  switch (effect.kind) {
    case 'statMod': {
      const percent = Math.round(effect.rate * 100);
      return `${effect.stat} ${percent >= 0 ? '+' : ''}${percent}%（${effect.turns}ターン）`;
    }
    case 'damageTaken': {
      const percent = Math.round(effect.rate * 100);
      return `被ダメージ ${percent >= 0 ? '+' : ''}${percent}%（${effect.turns}ターン）`;
    }
    case 'stun':
      return `スタン（${effect.turns}ターン）`;
  }
}

/**
 * 戦闘に登場した者のID→名前。party・enemy 両方の名前解決に使う。
 * ログの actorId/targetId はどちらの側のIDも指しうるので、呼び出し側で
 * 両方をまとめて渡す。
 */
export type NameTable = ReadonlyMap<string, string>;

/** 技IDから技名を引く。act イベントの表示にだけ要る。 */
export type SkillNameTable = ReadonlyMap<string, string>;

function nameOf(table: NameTable, id: string): string {
  return table.get(id) ?? id;
}

/** 技とは独立した状態変化も、発生順を保って表示する。 */
function describeNotice(event: Extract<BattleEvent, { t: 'expire' | 'enrage' | 'down' }>, names: NameTable): string {
  switch (event.t) {
    case 'expire':
      return `${nameOf(names, event.targetId)} の ${describeEffect(event.effect)} が切れた`;
    case 'enrage':
      return `${nameOf(names, event.actorId)} が激昂した`;
    case 'down':
      return `${nameOf(names, event.actorId)} が倒れた`;
  }
}

/** ログ全体をターン単位に分ける。turnStart より前に起きるイベントは無い前提。 */
export function groupBattleLog(events: readonly BattleEvent[], names: NameTable): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;
  let action: LogEntry | null = null;

  for (const event of events) {
    if (event.t === 'turnStart') {
      current = { turn: event.turn, entries: [] };
      groups.push(current);
      action = null;
      continue;
    }
    if (current === null || event.t === 'end') continue;
    if (event.t === 'act') {
      action = { actorId: event.actorId, skillId: event.skillId, outcomes: [] };
      current.entries.push(action);
      continue;
    }
    if (event.t === 'skip') {
      current.entries.push({ actorId: event.actorId, outcomes: [{ kind: event.t, text: `行動できなかった（${SKIP_REASON_LABEL[event.reason]}）` }] });
      action = null;
      continue;
    }
    // 激昂やターン末の失効は直前の技による効果として表示しない。
    if (event.t === 'enrage' || event.t === 'expire') {
      current.entries.push({ outcomes: [{ kind: event.t, text: describeNotice(event, names) }] });
      action = null;
      continue;
    }
    const outcome: LogOutcome = event.t === 'damage' || event.t === 'heal'
      ? { kind: event.t, target: nameOf(names, event.targetId), amount: event.amount, hpAfter: event.hpAfter }
      : event.t === 'effect'
        ? { kind: event.t, target: nameOf(names, event.targetId), text: `${describeEffect(event.effect)} が付与された` }
        : { kind: event.t, text: describeNotice(event, names) };
    if (action !== null) action.outcomes.push(outcome);
    else current.entries.push({ outcomes: [outcome] });
  }

  return groups;
}

/** 最後の end イベントから勝敗と経過ターンの見出しを作る。無ければ空文字（呼び出し側は起きない前提で扱う）。 */
export function summarizeResult(events: readonly BattleEvent[]): string {
  const end = [...events].reverse().find((event): event is Extract<BattleEvent, { t: 'end' }> => event.t === 'end');
  if (end === undefined) return '';
  return `${end.turns}ターンで${RESULT_LABEL[end.result]}`;
}
