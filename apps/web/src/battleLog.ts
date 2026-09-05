import type { BattleEvent, BattleResult, Effect, SkipReason } from '@mq/core';

/** ターンごとにまとめた表示用の単位（設計書 §4.4「ターンごとにまとめて、順に表示する」）。 */
export type TurnGroup = { turn: number; lines: string[] };

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

function skillNameOf(table: SkillNameTable, id: string): string {
  return table.get(id) ?? id;
}

/**
 * BattleEvent の1件を1行の日本語にする。turnStart と end はグループの境界に
 * 使うだけなので、ここでは行を作らない（呼び出し側の groupBattleLog が処理する）。
 */
function describeEvent(event: BattleEvent, names: NameTable, skills: SkillNameTable): string | null {
  switch (event.t) {
    case 'turnStart':
    case 'end':
      return null;
    case 'act':
      return `${nameOf(names, event.actorId)} が ${skillNameOf(skills, event.skillId)} を使った`;
    case 'damage':
      return `${nameOf(names, event.targetId)} に ${event.amount} ダメージ（残りHP ${event.hpAfter}）`;
    case 'heal':
      return `${nameOf(names, event.targetId)} が ${event.amount} 回復（残りHP ${event.hpAfter}）`;
    case 'effect':
      return `${nameOf(names, event.targetId)} に ${describeEffect(event.effect)} が付与された`;
    case 'expire':
      return `${nameOf(names, event.targetId)} の ${describeEffect(event.effect)} が切れた`;
    case 'skip':
      return `${nameOf(names, event.actorId)} は行動できなかった（${SKIP_REASON_LABEL[event.reason]}）`;
    case 'enrage':
      return `${nameOf(names, event.actorId)} が激昂した`;
    case 'down':
      return `${nameOf(names, event.actorId)} が倒れた`;
  }
}

/** ログ全体をターン単位に分ける。turnStart より前に起きるイベントは無い前提。 */
export function groupBattleLog(events: readonly BattleEvent[], names: NameTable, skills: SkillNameTable): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;

  for (const event of events) {
    if (event.t === 'turnStart') {
      current = { turn: event.turn, lines: [] };
      groups.push(current);
      continue;
    }
    const line = describeEvent(event, names, skills);
    if (line !== null && current !== null) current.lines.push(line);
  }

  return groups;
}

/** 最後の end イベントから勝敗と経過ターンの見出しを作る。無ければ空文字（呼び出し側は起きない前提で扱う）。 */
export function summarizeResult(events: readonly BattleEvent[]): string {
  const end = [...events].reverse().find((event): event is Extract<BattleEvent, { t: 'end' }> => event.t === 'end');
  if (end === undefined) return '';
  return `${end.turns}ターンで${RESULT_LABEL[end.result]}`;
}
