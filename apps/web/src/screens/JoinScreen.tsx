import { useState } from 'react';
import type { FormEvent } from 'react';
import { join, ApiError } from '../api.js';
import { saveToken } from '../token.js';

type Props = {
  onJoined: (token: string) => void;
};

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

/**
 * 招待コードと名前で参加する画面。トークン未保有のときだけ表示される。
 * コードが「無効」か「使用済み」かはサーバ自身が区別していないので、
 * ここでも同じ文言をそのまま出す（総当たりの手がかりを増やさないため）。
 */
export function JoinScreen({ onJoined }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const trimmedName = name.trim();
  const canSubmit = code !== '' && trimmedName !== '' && status.kind !== 'loading';

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus({ kind: 'loading' });
    try {
      const result = await join(code, trimmedName);
      saveToken(result.token);
      onJoined(result.token);
    } catch (error) {
      // join は未認証で叩くエンドポイントなので 401 は起こり得ない。
      // ApiError・ネットワーク例外を同じ扱いにして、原因を問わず再試行させる。
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setStatus({ kind: 'error', message });
    }
  }

  return (
    <main>
      <h1>みんなクエストに参加</h1>
      <form onSubmit={handleSubmit}>
        <label>
          招待コード
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={status.kind === 'loading'}
          />
        </label>
        <label>
          名前
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={status.kind === 'loading'}
          />
        </label>
        <button type="submit" disabled={!canSubmit}>
          {status.kind === 'loading' ? '参加中…' : '参加する'}
        </button>
      </form>
      {status.kind === 'error' && <p role="alert">{status.message}</p>}
    </main>
  );
}
