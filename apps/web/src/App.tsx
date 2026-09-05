import { useState } from 'react';
import { getToken, saveToken } from './token.js';
import { JoinScreen } from './screens/JoinScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { BattleScreen } from './screens/BattleScreen.js';
import { PartyScreen } from './screens/PartyScreen.js';
import { HistoryScreen } from './screens/HistoryScreen.js';
import { ArenaScreen } from './screens/ArenaScreen.js';

// タブは「今日」「戦闘」「仲間」「履歴」「闘技場」の5つ（設計書 段階5 §6）。
// 酒場とパーティを別タブにすると雇うたびに行き来することになるので
// 「仲間」に統合してある。闘技場は本編と独立して常設する腕試しの場なので、
// 「戦闘」に混ぜず別タブにする（設計書 §1「いつでも挑める腕試しとして並走」）。
type Tab = 'today' | 'battle' | 'party' | 'history' | 'arena';

/** localStorage が読めたかどうか。読めないブラウザ設定があるため状態として持つ。 */
type StorageState = { kind: 'ok'; token: string | null } | { kind: 'unavailable' };

/**
 * 画面の切り替えはパスではなく token の有無・タブの状態で行う（設計書 §4）。
 * token を App がここで一元的に持つのは、401 を受けたときに「今日」「履歴」の
 * どちらを表示中でも同じ1箇所で参加画面に戻せるようにするため。
 * 各画面が自分でトークンを持つと、片方だけ古いトークンのまま表示が残りかねない。
 */
export function App() {
  // localStorage は使えないことがある（プライベートモードやサイトデータの
  // ブロック設定）。読めない場合に例外がそのまま描画を突き抜けると、
  // 理由の書かれていない白い画面になる。それは「黙って失敗させない」
  // （設計書 §6）に反するので、ここで受け止めて理由を出す。
  const [storage] = useState<StorageState>(() => {
    try {
      return { kind: 'ok', token: getToken() };
    } catch {
      return { kind: 'unavailable' };
    }
  });
  const [token, setToken] = useState<string | null>(
    storage.kind === 'ok' ? storage.token : null,
  );
  const [tab, setTab] = useState<Tab>('today');
  const [saveFailed, setSaveFailed] = useState(false);

  function handleJoined(newToken: string): void {
    // 保存に失敗しても、そのセッションの間は遊べる。ただし次に開いたときには
    // 参加からやり直しになるので、そのことを伝えてから先に進める。
    try {
      saveToken(newToken);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
    setToken(newToken);
  }

  function handleUnauthorized(): void {
    // localStorage からの破棄は api.ts が既に行っている。ここでは画面の
    // 状態を合わせて JoinScreen へ切り替えるだけ（下の分岐がそれを担う）。
    setToken(null);
  }

  if (storage.kind === 'unavailable') {
    return (
      <main>
        <h1>みんなdeクエスト</h1>
        <p role="alert">
          ブラウザの保存領域が使えないため、参加状態を保てません。
          プライベートモードを解除するか、このサイトのデータ保存を許可してください。
        </p>
      </main>
    );
  }

  if (token === null) {
    return <JoinScreen onJoined={handleJoined} />;
  }

  return (
    <div>
      {saveFailed && (
        <p role="alert">
          参加状態を保存できませんでした。このタブを閉じると、参加からやり直しになります。
        </p>
      )}
      {/*
        タブに入ると、この遊びの名前がどこにも出なくなっていた。毎日ひらく
        画面なので、開いた瞬間に何の画面か分かる手がかりを1つ置く。
        見出しではなく飾りなので、h1 は各画面のものを使い続ける。
      */}
      <div className="brand" aria-hidden="true">
        みんなdeクエスト
      </div>
      <nav>
        <button type="button" onClick={() => setTab('today')} aria-current={tab === 'today'}>
          今日
        </button>
        <button type="button" onClick={() => setTab('battle')} aria-current={tab === 'battle'}>
          戦闘
        </button>
        <button type="button" onClick={() => setTab('party')} aria-current={tab === 'party'}>
          仲間
        </button>
        <button type="button" onClick={() => setTab('history')} aria-current={tab === 'history'}>
          履歴
        </button>
        <button type="button" onClick={() => setTab('arena')} aria-current={tab === 'arena'}>
          闘技場
        </button>
      </nav>
      {tab === 'today' && <TodayScreen token={token} onUnauthorized={handleUnauthorized} />}
      {tab === 'battle' && <BattleScreen token={token} onUnauthorized={handleUnauthorized} />}
      {tab === 'party' && <PartyScreen token={token} onUnauthorized={handleUnauthorized} />}
      {tab === 'history' && <HistoryScreen token={token} onUnauthorized={handleUnauthorized} />}
      {tab === 'arena' && <ArenaScreen token={token} onUnauthorized={handleUnauthorized} />}
    </div>
  );
}
