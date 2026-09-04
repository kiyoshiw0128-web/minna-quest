import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayScreen } from '../src/screens/TodayScreen.js';
import { jsonResponse, installFetchMock } from './mockFetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('未締めの日', () => {
  it('counts: null の応答では票数を出さず、「まだ分からない」と明示する', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 3, chapter: 1, optionIds: ['crossroads', 'restAtSpring', 'banditAmbush'],
          myVote: null, chosenId: null, counts: null, tiebroken: null,
        },
      }),
    });

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/まだ分かりません/)).toBeInTheDocument();
    // 票数そのものが画面のどこにも出ていないこと（"0票" 等の描画がない）を確認する。
    expect(screen.queryByText(/\d+票/)).not.toBeInTheDocument();
  });

  it('自分が投票済みの選択肢が強調される', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 1, chapter: 1, optionIds: ['crossroads', 'restAtSpring'],
          myVote: 'restAtSpring', chosenId: null, counts: null, tiebroken: null,
        },
      }),
    });

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);

    const votedButton = await screen.findByRole('button', { name: /泉で休む/ });
    const otherButton = screen.getByRole('button', { name: /分かれ道/ });
    expect(votedButton).toHaveAttribute('aria-pressed', 'true');
    expect(otherButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('マスタに無いIDが来たとき、IDをそのまま表示する（空欄にしない）', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 1, chapter: 1, optionIds: ['no-such-event-id'],
          myVote: null, chosenId: null, counts: null, tiebroken: null,
        },
      }),
    });

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /no-such-event-id/ })).toBeInTheDocument();
  });
});

describe('締め済みの日', () => {
  it('決まった選択肢と票数が出て、同数だった場合はその旨が出る', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 5, chapter: 1, optionIds: ['crossroads', 'restAtSpring'],
          myVote: 'crossroads', chosenId: 'crossroads',
          counts: { crossroads: 2, restAtSpring: 2 }, tiebroken: true,
        },
      }),
    });

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/今日決まったこと: 分かれ道/)).toBeInTheDocument();
    expect(screen.getByText('分かれ道: 2票')).toBeInTheDocument();
    expect(screen.getByText('泉で休む: 2票')).toBeInTheDocument();
    expect(screen.getByText(/同数だったため、シードで決定しました/)).toBeInTheDocument();
  });
});

describe('投票の締切競合', () => {
  it('「締め済み」で弾かれたとき、今日の画面が読み直される', async () => {
    installFetchMock({
      // 1回目: まだ開いている日。2回目（投票後の読み直し）: 締まった日。
      'GET /api/today': [
        jsonResponse(200, {
          ok: true,
          data: {
            dayNo: 1, chapter: 1, optionIds: ['crossroads'],
            myVote: null, chosenId: null, counts: null, tiebroken: null,
          },
        }),
        jsonResponse(200, {
          ok: true,
          data: {
            dayNo: 1, chapter: 1, optionIds: ['crossroads'],
            myVote: null, chosenId: 'crossroads', counts: { crossroads: 4 }, tiebroken: false,
          },
        }),
      ],
      'POST /api/vote': jsonResponse(400, { ok: false, error: 'this day is already closed' }),
    });
    const user = userEvent.setup();

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /分かれ道/ }));

    // エラー文言をそのまま出すのではなく、締まった後の画面に切り替わることを確認する。
    await waitFor(() => {
      expect(screen.getByText(/今日決まったこと: 分かれ道/)).toBeInTheDocument();
    });
    expect(screen.queryByText('this day is already closed')).not.toBeInTheDocument();
  });
});
