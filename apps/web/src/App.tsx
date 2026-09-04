import { useState } from 'react';
import { getToken, saveToken } from './token.js';
import { JoinScreen } from './screens/JoinScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { HistoryScreen } from './screens/HistoryScreen.js';

type Tab = 'today' | 'history';

/**
 * 画面の切り替えはパスではなく token の有無・タブの状態で行う（設計書 §4）。
 * token を App がここで一元的に持つのは、401 を受けたときに「今日」「履歴」の
 * どちらを表示中でも同じ1箇所で参加画面に戻せるようにするため。
 * 各画面が自分でトークンを持つと、片方だけ古いトークンのまま表示が残りかねない。
 */
export function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [tab, setTab] = useState<Tab>('today');

  function handleJoined(newToken: string): void {
    saveToken(newToken);
    setToken(newToken);
  }

  function handleUnauthorized(): void {
    // localStorage からの破棄は api.ts が既に行っている。ここでは画面の
    // 状態を合わせて JoinScreen へ切り替えるだけ（下の分岐がそれを担う）。
    setToken(null);
  }

  if (token === null) {
    return <JoinScreen onJoined={handleJoined} />;
  }

  return (
    <div>
      <nav>
        <button type="button" onClick={() => setTab('today')} aria-current={tab === 'today'}>
          今日
        </button>
        <button type="button" onClick={() => setTab('history')} aria-current={tab === 'history'}>
          世界の履歴
        </button>
      </nav>
      {tab === 'today' ? (
        <TodayScreen token={token} onUnauthorized={handleUnauthorized} />
      ) : (
        <HistoryScreen token={token} onUnauthorized={handleUnauthorized} />
      )}
    </div>
  );
}
