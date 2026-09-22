import { useEffect, useRef, useState } from 'react';
import { ApiError, UnauthorizedError, resolveStoryBattle } from '../api.js';
import type { StoryBattleResult } from '../api.js';
import { BattleResultView, EnemyPortrait } from '../battlePlanner.js';

/** Reading an encounter resolves it once using the server's saved turn order. */
export function StoryBattle({ token, dayNo, onUnauthorized, onResolved }: {
  token: string; dayNo: number; onUnauthorized: () => void; onResolved?: () => void;
}) {
  const [result, setResult] = useState<StoryBattleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onUnauthorized, onResolved });
  callbacks.current = { onUnauthorized, onResolved };
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    void resolveStoryBattle(token, dayNo).then((value) => {
      if (cancelled) return;
      setResult(value);
      callbacks.current.onResolved?.();
    }).catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof UnauthorizedError) callbacks.current.onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '戦闘結果を読み込めませんでした。');
    });
    return () => { cancelled = true; };
  }, [token, dayNo, attempt]);
  const report = result?.report;
  return <section aria-label="物語の戦闘結果">
    <h2>戦闘結果</h2>
    {!result && !error && <p role="status">設定した技で戦闘を進めています…</p>}
    {error && <><p role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>戦闘結果を読み直す</button></>}
    {report && <>
      <h3>{report.enemy.name}が現れた！</h3>
      <EnemyPortrait enemyId={report.enemy.id} name={report.enemy.name} />
      <BattleResultView party={report.party} enemy={report.enemy} log={report.log} rewarded={report.rewarded}
        rewardedMessage="この戦闘の報酬を受け取りました。" notRewardedMessage="この戦闘では報酬はありません。" />
      {result.questCompleted && <aside className="quest-completed" role="status">
        <strong>✓ 「{result.questCompleted.name}」完了</strong>
        <p>{result.questCompleted.resultText}</p>
        <small>完了報酬 {result.questCompleted.gold}Gを全員が受け取りました。</small>
      </aside>}
      {report.log.result !== 'win' && <p>「装備・スキル」で技の順番や装備を見直して、「戦闘」から再挑戦できます。</p>}
    </>}
    {result && !report && <p>{result.won ? '以前に勝利した戦闘です。詳細ログは保存されていません。' : '戦闘結果がありません。'}</p>}
  </section>;
}
