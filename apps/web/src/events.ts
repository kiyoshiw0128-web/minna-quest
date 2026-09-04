import { EVENTS } from '@mq/core';
import type { DailyEvent, EventKind } from '@mq/core';

export type ResolvedEvent = {
  readonly id: string;
  readonly label: string;
  /** マスタに無いIDのときは null。戦闘/出来事のバッジを出しようがないため。 */
  readonly kind: EventKind | null;
};

// @mq/core の EVENTS はキー名でアクセスする表なので、IDから引けるように作り直す。
// サーバは option の ID しか返さないため、こちらの形が要る。
// サーバは任意の文字列IDを返しうる（マスタ側の union 型に絞られない）ので、
// Map のキー型を string に広げておく。狭いままだと存在しないIDを引く判定ができない。
const EVENTS_BY_ID = new Map<string, DailyEvent>(Object.values(EVENTS).map((event) => [event.id, event]));

/**
 * 選択肢IDから表示名と種別を引く。
 * マスタに無いIDが来たら、IDをそのまま名前として使う（空欄にしない）。
 * 世界のデータとマスタの版が食い違っている、という事実自体を隠さないための挙動。
 */
export function resolveEvent(id: string): ResolvedEvent {
  const event = EVENTS_BY_ID.get(id);
  if (event === undefined) {
    return { id, label: id, kind: null };
  }
  return { id, label: event.name, kind: event.kind };
}
