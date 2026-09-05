import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartyScreen } from '../src/screens/PartyScreen.js';
import { jsonResponse, installFetchMock } from './mockFetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function meResponse(gold: number) {
  return jsonResponse(200, {
    ok: true,
    data: {
      name: 'いちろう',
      gold,
      party: [
        {
          id: 'hero1', name: 'ゆうしゃ', jobId: 'warrior', adventureLevel: 3, jobLevel: 3,
          stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
          learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
        },
      ],
    },
  });
}

function tavernResponse() {
  return jsonResponse(200, {
    ok: true,
    data: {
      dayNo: 4,
      recruits: [
        {
          id: 'r1', name: 'たろう', jobId: 'warrior',
          aptitude: { maxHp: 'A', maxMp: 'C', atk: 'B', def: 'C', mat: 'D', mdf: 'D', spd: 'E' },
          adventureLevel: 1, cost: 999999,
        },
      ],
    },
  });
}

describe('仲間画面（設計書 §5）', () => {
  it('所持金・パーティ・酒場の3人が出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText('所持金: 500 ゴールド')).toBeInTheDocument();
    expect(screen.getByText(/ゆうしゃ/)).toBeInTheDocument();
    expect(screen.getByText(/たろう/)).toBeInTheDocument();
    // 素質はA〜Eのまま出る（数字に直さない）。
    expect(screen.getByText(/HPA/)).toBeInTheDocument();
  });

  it('金貨不足で雇えないとき、サーバの文言がそのまま出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(0),
      'GET /api/tavern': tavernResponse(),
      'POST /api/hire': jsonResponse(400, { ok: false, error: 'insufficient gold' }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('所持金: 0 ゴールド');

    await user.click(screen.getByRole('button', { name: '雇う' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('insufficient gold');
  });

  it('雇用中はボタンが押せない', async () => {
    // Promise executor は同期的に呼ばれるので、resolveHire はこの後必ず代入済みになる。
    let resolveHire!: (response: Response) => void;
    const hirePromise = new Promise<Response>((resolve) => {
      resolveHire = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (method === 'GET' && url === '/api/me') return meResponse(999999);
        if (method === 'GET' && url === '/api/tavern') return tavernResponse();
        if (method === 'POST' && url === '/api/hire') return hirePromise;
        throw new Error(`このテストで想定していないリクエスト: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    const button = await screen.findByRole('button', { name: '雇う' });
    await user.click(button);

    expect(screen.getByRole('button', { name: '雇う' })).toBeDisabled();

    resolveHire(
      jsonResponse(200, { ok: true, data: { characterId: 'r1', name: 'たろう', jobId: 'warrior', cost: 999999 } }),
    );
    await waitFor(() => expect(screen.getByText('所持金: 999999 ゴールド')).toBeInTheDocument());
  });
});
