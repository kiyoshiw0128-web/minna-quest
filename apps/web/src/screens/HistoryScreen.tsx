import { useCallback, useEffect, useState } from 'react';
import { fetchWorld, ApiError, UnauthorizedError } from '../api.js';
import type { WorldResult } from '../api.js';
import { resolveEvent } from '../events.js';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: WorldResult };

/** 世界の履歴画面。締まった日の一覧と、獲得タグをそのまま出す。 */
export function HistoryScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const data = await fetchWorld(token);
      setLoad({ kind: 'loaded', data });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // TodayScreen と同じ理由で、ここでもエラー状態は経由させない。
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setLoad({ kind: 'error', message });
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (load.kind === 'loading') {
    return (
      <main>
        <h1>世界の履歴</h1>
        <p>読み込み中…</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main>
        <h1>世界の履歴</h1>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { data } = load;

  return (
    <main>
      <h1>{data.name}</h1>
      <p>
        {data.chapter}章 {data.currentDay}日目
      </p>
      <section>
        <h2>獲得したタグ</h2>
        {/* 「通ってきたルート」の可視化なので、そのまま列挙する（設計書 §4.4）。 */}
        {data.tags.length === 0 ? <p>まだありません</p> : (
          <ul>
            {data.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>締まった日</h2>
        {data.history.length === 0 ? (
          <p>まだありません</p>
        ) : (
          <ul>
            {data.history.map((day) => {
              const chosen = day.chosenId !== null ? resolveEvent(day.chosenId) : null;
              return (
                <li key={day.dayNo}>
                  {day.dayNo}日目: {chosen?.label ?? '(未決定)'}
                  {day.tiebroken === true && '（同数・シード決定）'}
                  <ul>
                    {day.optionIds.map((optionId) => {
                      const event = resolveEvent(optionId);
                      const count = day.counts?.[optionId] ?? 0;
                      return (
                        <li key={optionId}>
                          {event.label}: {count}票
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
