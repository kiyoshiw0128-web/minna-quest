import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryBattle } from '../src/screens/StoryBattle.js';
import { jsonResponse, installFetchMock } from './mockFetch.js';

afterEach(() => vi.unstubAllGlobals());
const report = {
  party: [{ id: 'hero', name: '旅人', skills: [{ id: 'slash', name: '斬りつける' }] }],
  enemy: { id: 'rat', name: '大ネズミ', skills: [{ id: 'bite', name: 'かじりつく' }] },
  rewarded: true,
  log: { result: 'win', turns: 2, events: [
    { t: 'turnStart', turn: 1 }, { t: 'act', actorId: 'hero', skillId: 'slash' },
    { t: 'damage', targetId: 'rat', amount: 27, hpAfter: 10 },
    { t: 'act', actorId: 'rat', skillId: 'bite' }, { t: 'damage', targetId: 'hero', amount: 4, hpAfter: 96 },
    { t: 'turnStart', turn: 2 }, { t: 'act', actorId: 'hero', skillId: 'slash' },
    { t: 'damage', targetId: 'rat', amount: 27, hpAfter: 0 }, { t: 'down', actorId: 'rat' },
    { t: 'end', result: 'win', turns: 2 },
  ] },
};

it('操作なしでターン・技・対象・ダメージを表示し、親の再描画で再送しない', async () => {
  installFetchMock({ 'POST /api/battle': jsonResponse(200, { ok: true, data: { report, won: true, worldDefeated: true } }) });
  const resolved = vi.fn();
  const view = render(<StoryBattle token="t" dayNo={2} onUnauthorized={vi.fn()} onResolved={resolved} />);
  expect(await screen.findByText('結果: 2ターンで勝利')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ターン1' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ターン2' })).toBeInTheDocument();
  expect(screen.getAllByText('斬りつける！')).toHaveLength(2);
  expect(screen.getAllByText('27')).toHaveLength(2);
  expect(screen.getByRole('region', { name: '物語の戦闘結果' })).toHaveTextContent('大ネズミ');
  view.rerender(<StoryBattle token="t" dayNo={2} onUnauthorized={vi.fn()} onResolved={vi.fn()} />);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(resolved).toHaveBeenCalledTimes(1);
});

it('通信失敗は明示して読み直せる', async () => {
  installFetchMock({ 'POST /api/battle': [jsonResponse(503, { ok: false, error: '一時的なエラー' }), jsonResponse(200, { ok: true, data: { report, won: true, worldDefeated: true } })] });
  render(<StoryBattle token="t" dayNo={2} onUnauthorized={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('一時的なエラー');
  await userEvent.click(screen.getByRole('button', { name: '戦闘結果を読み直す' }));
  expect(await screen.findByText('結果: 2ターンで勝利')).toBeInTheDocument();
});

it('未認証なら復帰画面へ戻す', async () => {
  const unauthorized = vi.fn();
  installFetchMock({ 'POST /api/battle': jsonResponse(401, { ok: false, error: 'unauthorized' }) });
  render(<StoryBattle token="t" dayNo={2} onUnauthorized={unauthorized} />);
  await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce());
});
