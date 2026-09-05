import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BattleEvent, Enemy, PartyMember, Skill } from '@mq/core';
import { BattleScreen } from '../src/screens/BattleScreen.js';
import { jsonResponse, installFetchMock } from './mockFetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SLASH: Skill = {
  id: 'slash', name: '斬る', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 50 },
};

const HERO: PartyMember = {
  id: 'hero1', name: 'ゆうしゃ',
  stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
  skills: [SLASH],
};

const ENEMY: Enemy = {
  id: 'goblin', name: 'ゴブリン',
  stats: { maxHp: 80, maxMp: 0, atk: 10, def: 5, mat: 5, mdf: 5, spd: 8 },
  skills: [SLASH],
  pattern: [{ skillId: 'slash' }],
};

/** 世界の履歴の応答。4日目が戦闘だった日として登録されている想定。 */
function worldResponse() {
  return jsonResponse(200, {
    ok: true,
    data: {
      id: 'w1', name: 'テスト世界', currentDay: 5, chapter: 1, tags: [],
      history: [
        { dayNo: 4, optionIds: ['banditAmbush', 'crossroads'], chosenId: 'banditAmbush', counts: { banditAmbush: 3 }, tiebroken: false },
      ],
    },
  });
}

function noBattleResponse(dayNo = 4) {
  return jsonResponse(200, { ok: true, data: { dayNo, hasBattle: false } });
}

function battleResponse(overrides: Partial<{ won: boolean; worldDefeated: boolean }> = {}) {
  return jsonResponse(200, {
    ok: true,
    data: {
      dayNo: 4, hasBattle: true, enemy: ENEMY, party: [HERO],
      won: overrides.won ?? false, worldDefeated: overrides.worldDefeated ?? false,
    },
  });
}

describe('戦闘が無い日（設計書 §4.1）', () => {
  it('その旨と、日の選択肢が出る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': noBattleResponse(),
    });

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/戦闘はありません/)).toBeInTheDocument();
    // 戦闘だった日（4日目）が選択肢として出る。
    expect(screen.getByRole('option', { name: '4日目' })).toBeInTheDocument();
  });
});

describe('プランを組む（設計書 §4.3）', () => {
  it('敵の行動表が8ターンぶん、味方の行と同じ列数で出る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse(),
    });

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);

    await screen.findByText('プラン（8ターン）');

    const enemyRow = screen.getByText('通常').closest('tr');
    expect(enemyRow).not.toBeNull();
    expect(within(enemyRow as HTMLElement).getAllByRole('cell')).toHaveLength(8);

    const planRow = screen.getByText('ゆうしゃ').closest('tr');
    expect(planRow).not.toBeNull();
    expect(within(planRow as HTMLElement).getAllByRole('combobox')).toHaveLength(8);
  });
});

describe('送信（設計書 §4.4）', () => {
  it('プランを組んで送ると、その内容が本文に入る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse(),
      'POST /api/battle': jsonResponse(200, {
        ok: true,
        data: { log: { result: 'win', turns: 1, events: [{ t: 'end', result: 'win', turns: 1 }] }, rewarded: true, worldDefeated: false },
      }),
    });
    const user = userEvent.setup();

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const turn1 = screen.getByLabelText('ゆうしゃ のターン1');
    await user.selectOptions(turn1, 'slash');
    await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));

    await waitFor(() => expect(screen.getByText(/報酬が入りました/)).toBeInTheDocument());

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall as [unknown, RequestInit])[1].body as string);
    expect(body.plan.hero1[0]).toBe('slash');
    expect(body.dayNo).toBe(4);
  });

  it('ログがターンごとにまとまって出る。行動できなかった理由が出る', async () => {
    const events: BattleEvent[] = [
      { t: 'turnStart', turn: 1 },
      { t: 'skip', actorId: 'hero1', reason: 'noMp' },
      { t: 'turnStart', turn: 2 },
      { t: 'act', actorId: 'hero1', skillId: 'slash' },
      { t: 'damage', targetId: 'goblin', amount: 50, hpAfter: 30 },
      { t: 'end', result: 'win', turns: 2 },
    ];
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse(),
      'POST /api/battle': jsonResponse(200, {
        ok: true,
        data: { log: { result: 'win', turns: 2, events }, rewarded: true, worldDefeated: false },
      }),
    });
    const user = userEvent.setup();

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');
    await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));

    const turn1Heading = await screen.findByRole('heading', { name: 'ターン1' });
    const turn2Heading = screen.getByRole('heading', { name: 'ターン2' });
    expect(turn1Heading).toBeInTheDocument();
    expect(turn2Heading).toBeInTheDocument();
    expect(screen.getByText(/MP不足/)).toBeInTheDocument();
    expect(screen.getByText(/斬る を使った/)).toBeInTheDocument();
  });

  it('負けてもプランが残る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse(),
      'POST /api/battle': jsonResponse(200, {
        ok: true,
        data: {
          log: { result: 'lose', turns: 1, events: [{ t: 'turnStart', turn: 1 }, { t: 'end', result: 'lose', turns: 1 }] },
          rewarded: false,
          worldDefeated: false,
        },
      }),
    });
    const user = userEvent.setup();

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const turn1 = screen.getByLabelText('ゆうしゃ のターン1') as HTMLSelectElement;
    await user.selectOptions(turn1, 'slash');
    expect(turn1.value).toBe('slash');

    await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));
    await waitFor(() => expect(screen.getByText(/報酬は入りませんでした/)).toBeInTheDocument());

    // プランが消えていないこと。
    expect((screen.getByLabelText('ゆうしゃ のターン1') as HTMLSelectElement).value).toBe('slash');
  });
});

describe('すでに勝っている・討伐済み（設計書 §4.6）', () => {
  it('すでに勝っている日で、報酬が入らないことが表示される', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse({ won: true }),
    });

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/すでに勝利しています/)).toBeInTheDocument();
    expect(screen.getByText(/報酬は入りません/)).toBeInTheDocument();
  });

  it('世界として討伐済みのとき、その旨が出る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse({ worldDefeated: true }),
    });

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/世界としてすでに討伐されています/)).toBeInTheDocument();
  });
});

describe('二重送信の防止（設計書 §6）', () => {
  it('送信中は送信ボタンが押せない', async () => {
    // Promise executor は同期的に呼ばれるので、resolvePost はこの後必ず代入済みになる。
    let resolvePost!: (response: Response) => void;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (method === 'GET' && url === '/api/world') return worldResponse();
        if (method === 'GET' && url === '/api/battle') return battleResponse();
        if (method === 'POST' && url === '/api/battle') return postPromise;
        throw new Error(`このテストで想定していないリクエスト: ${method} ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const button = screen.getByRole('button', { name: 'このプランで挑む' });
    await user.click(button);

    // 応答がまだ返っていない間、ボタンは押せない状態になっている。
    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled();

    resolvePost(
      jsonResponse(200, {
        ok: true,
        data: { log: { result: 'win', turns: 1, events: [{ t: 'end', result: 'win', turns: 1 }] }, rewarded: true, worldDefeated: false },
      }),
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'このプランで挑む' })).not.toBeDisabled());
  });
});

/**
 * 行動表と自分の手を見比べるのがこの画面の目的なので、行動表が技のIDのまま
 * 出ていると機能しない。ログ側は名前で出るため、同じ技だと気づけない。
 * 実際にローカルで動かしたとき、行動表だけ「dragonBreath」と出ていた。
 */
describe('行動表の読みやすさ', () => {
  it('敵の行動表は技のIDではなく名前で出る', async () => {
    installFetchMock({
      'GET /api/world': worldResponse(),
      'GET /api/battle': battleResponse(),
    });

    render(<BattleScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const enemyRow = screen.getByText('通常').closest('tr') as HTMLElement;
    const cells = within(enemyRow).getAllByRole('cell');
    for (const cell of cells) {
      expect(cell.textContent).toBe('斬る');
      expect(cell.textContent).not.toBe('slash');
    }
  });
});
