import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';
import { jsonResponse, installFetchMock } from './mockFetch.js';

const TOKEN_KEY = 'mq.token';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('画面の出し分け', () => {
  it('トークンが無ければ参加画面が出る', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'みんなクエスト' })).toBeInTheDocument();
  });

  it('トークンがあれば今日の画面が出る', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'valid-token');
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 1, chapter: 1, optionIds: ['crossroads'],
          myVote: null, chosenId: null, counts: null, tiebroken: null,
        },
      }),
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '1章 1日目' })).toBeInTheDocument();
    });
  });
});

describe('参加', () => {
  it('招待コードが無効なとき、その旨が出て、トークンが保存されない', async () => {
    installFetchMock({
      'POST /api/join': jsonResponse(400, { ok: false, error: 'invalid or used invite code' }),
    });
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText('招待コード'), 'used-code');
    await user.type(screen.getByLabelText('名前'), 'たろう');
    await user.click(screen.getByRole('button', { name: '参加する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or used invite code');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    // 参加画面のままであること（今日の画面へは進んでいない）。
    expect(screen.getByRole('heading', { name: 'みんなクエスト' })).toBeInTheDocument();
  });
});

describe('401', () => {
  it('401 が返ったらトークンを捨てて参加画面に戻す', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'stale-token');
    installFetchMock({
      'GET /api/today': jsonResponse(401, { ok: false, error: 'unauthorized' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'みんなクエスト' })).toBeInTheDocument();
    });
    // 参加画面に戻るだけでなく、次回起動時も同じ古いトークンで再認証を試みないことを確認する。
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    // 401 の応答は ok:false なので、その本文のエラーメッセージ（"unauthorized"）が
    // 今日の画面のエラー表示として一瞬でも残っていないことを確認する（半端な表示の防止）。
    expect(screen.queryByText('unauthorized')).not.toBeInTheDocument();
  });
});

describe('保存領域が使えないブラウザ', () => {
  it('localStorage が読めないとき、白い画面ではなく理由を出す', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      render(<App />);
      expect(screen.getByRole('alert').textContent).toContain('保存領域が使えない');
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * 招待コードは1人1枚の使い切りなので、端末を変えるたびに1枚消えるのでは
 * 遊べない。合言葉で戻れることを検査する。
 */
describe('合言葉で戻る', () => {
  it('正しい合言葉を貼ると、招待コードを使わずに入れる', async () => {
    installFetchMock({
      'GET /api/me': jsonResponse(200, { ok: true, data: { name: 'きよし', gold: 0, party: [] } }),
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 1, chapter: 1, optionIds: ['crossroads'],
          myVote: null, chosenId: null, counts: null, tiebroken: null,
        },
      }),
    });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '合言葉で戻る' }));
    await userEvent.type(screen.getByLabelText('合言葉'), 'secret-token');
    await userEvent.click(screen.getByRole('button', { name: '戻る' }));

    await screen.findByRole('heading', { name: /1日目/ });
    expect(localStorage.getItem('mq.token')).toBe('secret-token');
    // 招待コードのエンドポイントは一度も叩かれていない。
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) =>
      String(call[0]),
    );
    expect(calls.some((url) => url.includes('/api/join'))).toBe(false);
  });

  it('通らない合言葉では入れず、保存もしない', async () => {
    installFetchMock({
      'GET /api/me': jsonResponse(401, { ok: false, error: 'unauthorized' }),
    });

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '合言葉で戻る' }));
    await userEvent.type(screen.getByLabelText('合言葉'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '戻る' }));

    await screen.findByText('合言葉が違います');
    expect(localStorage.getItem('mq.token')).toBeNull();
  });
});
