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

    const votedButton = await screen.findByRole('radio', { name: /泉で休む/ });
    const otherButton = screen.getByRole('radio', { name: /分かれ道/ });
    expect(votedButton).toBeChecked();
    expect(otherButton).not.toBeChecked();
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

    expect(await screen.findByRole('radio', { name: /no-such-event-id/ })).toBeInTheDocument();
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

    await user.click(await screen.findByRole('radio', { name: /分かれ道/ }));
    await user.click(screen.getByRole('button', { name: '決定' }));

    // エラー文言をそのまま出すのではなく、締まった後の画面に切り替わることを確認する。
    await waitFor(() => {
      expect(screen.getByText(/今日決まったこと: 分かれ道/)).toBeInTheDocument();
    });
    expect(screen.queryByText('this day is already closed')).not.toBeInTheDocument();
  });
});

/**
 * 締まった日に何が起きたかを読ませる。
 * 名前と票数だけだと「分かれ道に決まりました」で終わり、毎日の選択で冒険が
 * 変わるという遊びなのに、変わった中身が読めない。
 */
describe('締まった日の結果の文章', () => {
  it('決まった選択肢の結果が本文として出る', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, {
        ok: true,
        data: {
          dayNo: 1, chapter: 1,
          optionIds: ['crossroads', 'restAtSpring', 'meetElder'],
          myVote: 'crossroads', chosenId: 'crossroads',
          counts: { crossroads: 2, restAtSpring: 1, meetElder: 0 },
          tiebroken: false,
        },
      }),
    });

    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText(/今日決まったこと/);

    const narrative = document.querySelector('.narrative');
    expect(narrative).not.toBeNull();
    expect((narrative?.textContent ?? '').length).toBeGreaterThan(10);
  });
});

describe('選択して決定する', () => {
  it('選んだだけでは送信せず、失敗したら選択を残して再試行できる', async () => {
    const data = { dayNo: 1, chapter: 1, optionIds: ['crossroads', 'restAtSpring'], myVote: null, chosenId: null, counts: null, tiebroken: null };
    installFetchMock({
      'GET /api/today': [jsonResponse(200, { ok: true, data }), jsonResponse(200, { ok: true, data: { ...data, myVote: 'restAtSpring' } })],
      'POST /api/vote': [jsonResponse(500, { ok: false, error: '一時的なエラー' }), jsonResponse(200, { ok: true, data: {} })],
    });
    const user = userEvent.setup();
    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByRole('radio', { name: /泉で休む/ }));
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '決定' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('radio', { name: /泉で休む/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '決定' }));
    await screen.findByText('投票済み：泉で休む');
    expect(screen.getByRole('button', { name: '決定' })).toBeDisabled();
  });
});

describe('地図と実際に確定した冒険', () => {
  it('投票先を選び直しても、前日の結果から決まる現在地は変わらない', async () => {
    installFetchMock({
      'GET /api/today': jsonResponse(200, { ok: true, data: {
        dayNo: 2, chapter: 1, optionIds: ['restAtSpring', 'meetElder'],
        previousChosenId: 'forestSpiritPray', myVote: null, chosenId: null, counts: null, tiebroken: null,
      } }),
    });
    const user = userEvent.setup();
    const { container } = render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('▼ 現在地：月影の森');
    await user.click(screen.getByRole('radio', { name: /泉で休む/ }));
    expect(container.querySelector('[aria-current="location"]')).toHaveTextContent('月影の森');
    expect(screen.getByText('▼ 現在地：月影の森')).toBeInTheDocument();
  });
});

describe('物語と依頼のつながり', () => {
  it('焼けた集落の現在地と説明をそろえ、無関係な村の説明を出さない', async () => {
    installFetchMock({ 'GET /api/today': jsonResponse(200, { ok: true, data: {
      dayNo: 9, chapter: 2, previousChosenId: 'burnedVillage', tags: ['saw-ruins'],
      optionIds: ['aidSurvivors', 'lootRelic', 'portCargo'], myVote: null, chosenId: null, counts: null, tiebroken: null,
    } }) });
    const { container } = render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('▼ 現在地：星詠みの遺跡');
    expect(container.querySelector('.location-story')).toHaveTextContent('焼けたアッシュ村');
    expect(container.querySelector('.location-story')).not.toHaveTextContent('赤い屋根');
    expect(screen.getByRole('radio', { name: /生存者の救出/ })).toHaveAccessibleName(/星詠みの遺跡で/);
  });
  it('依頼の討伐待ちを明示し、投票を選んでも完了扱いにしない', async () => {
    installFetchMock({ 'GET /api/today': jsonResponse(200, { ok: true, data: {
      dayNo: 4, chapter: 1, previousChosenId: 'millBoar', tags: ['q-mill-1', 'q-mill-2', 'q-mill-3'],
      optionIds: ['crossroads', 'restAtSpring'], myVote: null, chosenId: null, counts: null, tiebroken: null,
    } }) });
    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    const journal = await screen.findByRole('region', { name: '依頼の手帳' });
    expect(journal).toHaveTextContent('水路を守る大猪を倒す');
    expect(journal).toHaveTextContent('戦闘');
    await userEvent.setup().click(screen.getByRole('radio', { name: /分かれ道/ }));
    expect(journal).not.toHaveTextContent('依頼完了');
  });
  it('旧版で提示済みの遠方の行動には経由地を表示する', async () => {
    installFetchMock({ 'GET /api/today': jsonResponse(200, { ok: true, data: {
      dayNo: 1, chapter: 1, optionIds: ['dragonlingClash'], myVote: null, chosenId: null, counts: null, tiebroken: null,
    } }) });
    render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    expect(await screen.findByText(/街道：リーフ村 → 月影の森 → 白峰の峠 → 黒曜の砦/)).toBeInTheDocument();
  });
});

describe('冒険の物語と戦闘結果', () => {
  it('前日の戦闘結果を物語の後、次回行動選択の前に表示する', async () => {
    const enemy = { id: 'banditScout', name: '山賊の見張り', stats: {}, skills: [], pattern: [] };
    installFetchMock({
      'GET /api/today': jsonResponse(200, { ok: true, data: {
        dayNo: 3, chapter: 1, previousChosenId: 'banditAmbush', tags: [], optionIds: ['crossroads'],
        myVote: null, chosenId: null, counts: null, tiebroken: null,
      } }),
      'GET /api/world': jsonResponse(200, { ok: true, data: { currentDay: 3, history: [] } }),
      'GET /api/battle?dayNo=2': jsonResponse(200, { ok: true, data: {
        dayNo: 2, hasBattle: true, enemy, party: [], won: true, worldDefeated: true,
        report: { enemy, party: [], rewarded: true, log: { result: 'win', turns: 3, events: [{ t: 'end', result: 'win', turns: 3 }] } },
      } }),
    });
    const { container } = render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
    const result = await screen.findByText('結果: 3ターンで勝利');
    const narrative = container.querySelector('.previous-story')!;
    const choices = screen.getByRole('heading', { name: '∞ 次回行動選択' });
    expect(narrative.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

it('冒険内で再挑戦した敗北と行動表は、依頼の再取得後も消えない', async () => {
  const skill = { id: 'slash', name: '斬る', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 } };
  const stats = { maxHp: 100, maxMp: 10, atk: 15, def: 10, mat: 10, mdf: 10, spd: 10 };
  const hero = { id: 'hero', name: '旅人', stats, skills: [skill] };
  const enemy = { id: 'banditScout', name: '山賊', stats, skills: [skill], pattern: [{ skillId: 'slash' }] };
  const data = { dayNo: 3, chapter: 1, previousChosenId: 'banditAmbush', tags: [], optionIds: ['crossroads'], myVote: null, chosenId: null, counts: null, tiebroken: null };
  installFetchMock({
    'GET /api/today': jsonResponse(200, { ok: true, data }),
    'GET /api/world': jsonResponse(200, { ok: true, data: { currentDay: 3, history: [] } }),
    'GET /api/battle?dayNo=2': jsonResponse(200, { ok: true, data: { dayNo: 2, hasBattle: true, enemy, party: [hero], won: true, worldDefeated: true,
      report: { enemy, party: [hero], rewarded: true, log: { result: 'win', turns: 3, events: [{ t: 'end', result: 'win', turns: 3 }] } },
    } }),
    'POST /api/battle': jsonResponse(200, { ok: true, data: { log: { result: 'lose', turns: 8, events: [{ t: 'end', result: 'lose', turns: 8 }] }, rewarded: false, worldDefeated: true } }),
  });
  const user = userEvent.setup();
  render(<TodayScreen token="t" onUnauthorized={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: '行動を組み直して再挑戦する' }));
  await user.selectOptions(screen.getByLabelText('旅人 のターン1'), 'slash');
  await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));
  await screen.findByText('結果: 8ターンで敗北');
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/today')).toHaveLength(2));
  expect(screen.getByLabelText('旅人 のターン1')).toHaveValue('slash');
  expect(screen.getByText('結果: 8ターンで敗北')).toBeInTheDocument();
});
