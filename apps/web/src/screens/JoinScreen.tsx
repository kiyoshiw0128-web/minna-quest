import { useState } from 'react';
import type { FormEvent } from 'react';
import { join, fetchMe, requestRecovery, ApiError, UnauthorizedError, confirmRecovery } from '../api.js';

type Props = {
  onJoined: (token: string) => void;
};

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

type Mode = 'join' | 'restore' | 'recover';

/** 復旧要求の結果。登録の有無に関わらず同じ状態にする（設計書 §2.3）。 */
type RecoverStatus = { kind: 'idle' } | { kind: 'loading' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * 参加、または合言葉で戻る画面。トークン未保有のときだけ表示される。
 *
 * **戻る手段が要る理由。** 招待コードは1人1枚の使い切りで、参加の証は
 * ブラウザの保存領域にしか無い。別の端末で開く、プライベートウィンドウを閉じる、
 * サイトデータを消す、のどれでも参加からやり直しになり、そのたびに招待コードが
 * 1枚減っていく。スマホとパソコンで開くだけで2枚要る、という状態だった。
 * 合言葉（＝トークンそのもの）を貼れば戻れるようにして、これを塞ぐ。
 *
 * コードが「無効」か「使用済み」かはサーバ自身が区別していないので、
 * ここでも同じ文言をそのまま出す（総当たりの手がかりを増やさないため）。
 */
export function JoinScreen({ onJoined }: Props) {
  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverStatus, setRecoverStatus] = useState<RecoverStatus>({ kind: 'idle' });

  const loading = status.kind === 'loading';
  const trimmedName = name.trim();
  const trimmedSecret = secret.trim();
  const canSubmit = loading
    ? false
    : mode === 'join'
      ? code !== '' && trimmedName !== ''
      : trimmedSecret !== '';

  function switchMode(next: Mode): void {
    setMode(next);
    // 片方の失敗の文言がもう片方に残ると、何に対する失敗か分からなくなる。
    setStatus({ kind: 'idle' });
    setRecoverStatus({ kind: 'idle' });
  }

  /**
   * 合言葉の再送を要求する。**登録されていても未登録でも同じ画面を出す。**
   * 「送りました」と断言すると、それだけで登録の有無が外から分かってしまう
   * ため、常に「登録されていれば送りました」という言い回しにする（設計書 §6）。
   */
  /**
   * 復旧コードを使う。通れば新しい合言葉が返るので、そのまま入る。
   * 断られた理由は言い分けない（期限切れか使用済みかを区別できると、
   * 総当たりに手がかりを与える）。
   */
  async function handleConfirmSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const code = recoverCode.trim();
    if (code === '') return;

    setRecoverStatus({ kind: 'loading' });
    try {
      const result = await confirmRecovery(code);
      onJoined(result.token);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setRecoverStatus({ kind: 'error', message });
    }
  }

  async function handleRecoverSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmedEmail = recoverEmail.trim();
    if (trimmedEmail === '' || recoverStatus.kind === 'loading') return;

    setRecoverStatus({ kind: 'loading' });
    try {
      await requestRecovery(trimmedEmail);
      setRecoverStatus({ kind: 'sent' });
    } catch (error) {
      // 通信そのものの失敗（オフライン等）は別扱いにしてよい。ここで隠すべきは
      // 「そのアドレスが登録されているか」だけで、通信できたかどうかではない。
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setRecoverStatus({ kind: 'error', message });
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus({ kind: 'loading' });
    try {
      if (mode === 'join') {
        const result = await join(code, trimmedName);
        onJoined(result.token);
        return;
      }
      // 合言葉が本当に通るかを確かめてから保存する。確かめずに保存すると、
      // 打ち間違いのまま入ったように見えて、次の画面で 401 に落ちる。
      await fetchMe(trimmedSecret);
      onJoined(trimmedSecret);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        setStatus({ kind: 'error', message: '合言葉が違います' });
        return;
      }
      // join は未認証で叩くエンドポイントなので 401 は起こり得ない。
      // ApiError・ネットワーク例外を同じ扱いにして、原因を問わず再試行させる。
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setStatus({ kind: 'error', message });
    }
  }

  return (
    <main className="join-layout">
      <div className="book-cover">
        <p className="eyebrow">HIBITAN / A SHARED ADVENTURE</p>
        <h1>日々譚</h1>
        <p className="book-reading">ひびたん</p>
        <div className="cover-story">
          <p className="cover-title">今日の一票が、<br />明日の物語になる。</p>
          <p>仲間と選ぶ道。自分だけのパーティ。<br />毎日、少しずつ綴る冒険の書。</p>
        </div>
        <p className="cover-footnote">物語はみんなで。冒険はあなたらしく。</p>
      </div>

      <div className="join-panel">
      <p className="eyebrow">YOUR JOURNEY</p>
      <h2 className="join-title">冒険の書をひらく</h2>
      <p className="join-intro">{mode === 'join' ? '招待状を手に、新しい物語へ。' : 'あなたの物語の続きを、ここから。'}</p>

      <nav aria-label="参加方法">
        <button type="button" onClick={() => switchMode('join')} aria-current={mode === 'join'}>
          はじめて参加する
        </button>
        <button type="button" onClick={() => switchMode('restore')} aria-current={mode === 'restore'}>
          合言葉で戻る
        </button>
      </nav>

      {mode !== 'recover' && (
        <form onSubmit={handleSubmit}>
          {mode === 'join' ? (
            <>
              <label>
                招待コード
                <input value={code} onChange={(event) => setCode(event.target.value)} disabled={loading} />
              </label>
              <label>
                名前
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={loading} />
              </label>
            </>
          ) : (
            <>
              <p>
                すでに参加している場合は、合言葉を貼ると同じ冒険に戻れます。
                招待コードは減りません。合言葉は「仲間」の画面に出ています。
              </p>
              <label>
                合言葉
                <input value={secret} onChange={(event) => setSecret(event.target.value)} disabled={loading} />
              </label>
            </>
          )}
          <button type="submit" disabled={!canSubmit}>
            {loading ? '確認中…' : mode === 'join' ? '参加する' : '戻る'}
          </button>
        </form>
      )}

      {mode === 'restore' && (
        <p>
          <button type="button" onClick={() => switchMode('recover')}>
            合言葉が分からない
          </button>
        </p>
      )}

      {mode === 'recover' && (
        <>
          <p>
            メールアドレスを登録していれば、1回だけ使える復旧コードを送れます。
            登録していない場合は何も届きません。
          </p>
          {recoverStatus.kind === 'sent' ? (
            <>
              <p role="status">登録されていれば送りました。届いた復旧コードを貼ってください。</p>
              {/*
                コードを貼る口をここに出す。別の画面に飛ばすと、メールと画面を
                行き来する間に「どこに貼るのか」を見失う。
              */}
              <form onSubmit={(event) => void handleConfirmSubmit(event)}>
                <label>
                  復旧コード
                  <input
                    value={recoverCode}
                    onChange={(event) => setRecoverCode(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={recoverCode.trim() === ''}>
                  このコードで戻る
                </button>
              </form>
            </>
          ) : (
            <form onSubmit={(event) => void handleRecoverSubmit(event)}>
              <label>
                メールアドレス
                <input
                  type="email"
                  value={recoverEmail}
                  onChange={(event) => setRecoverEmail(event.target.value)}
                  disabled={recoverStatus.kind === 'loading'}
                />
              </label>
              <button
                type="submit"
                disabled={recoverEmail.trim() === '' || recoverStatus.kind === 'loading'}
              >
                {recoverStatus.kind === 'loading' ? '送信中…' : '再送を要求する'}
              </button>
            </form>
          )}
          {recoverStatus.kind === 'error' && <p role="alert">{recoverStatus.message}</p>}
          <p>
            <button type="button" onClick={() => switchMode('restore')}>
              戻る
            </button>
          </p>
        </>
      )}

      {status.kind === 'error' && <p role="alert">{status.message}</p>}
      <p className="join-note">毎朝5時、新しい一日がはじまります。</p>
      </div>
    </main>
  );
}
