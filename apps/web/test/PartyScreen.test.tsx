import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
          // GET /api/me が転職画面のために足したもの（設計書 §3）。
          jobLevels: { warrior: 3 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
      ],
    },
  });
}

/** 転職後の再読み込みで返る想定の応答。武闘家Lv1に変わっただけの差分。 */
function meResponseAsMonk(gold: number) {
  return jsonResponse(200, {
    ok: true,
    data: {
      name: 'いちろう',
      gold,
      party: [
        {
          id: 'hero1', name: 'ゆうしゃ', jobId: 'monk', adventureLevel: 3, jobLevel: 1,
          stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
          learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
          jobLevels: { warrior: 3, monk: 1 },
          unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
      ],
    },
  });
}

/** 挑発（provoke）を習得済みだが未装備の状態。装備更新のテスト用。 */
function meResponseWithProvoke(gold: number) {
  return jsonResponse(200, {
    ok: true,
    data: {
      name: 'いちろう',
      gold,
      party: [
        {
          id: 'hero1', name: 'ゆうしゃ', jobId: 'warrior', adventureLevel: 4, jobLevel: 4,
          stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
          learnedSkillIds: ['slash', 'provoke'], equippedSkillIds: ['slash'],
          jobLevels: { warrior: 4 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
      ],
    },
  });
}

/** 主人公＋雇用メンバー1人。並べ替えのテスト用。 */
function meResponseTwoMembers(gold: number) {
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
          jobLevels: { warrior: 3 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
        {
          id: 'hire1', name: 'たろう', jobId: 'warrior', adventureLevel: 1, jobLevel: 1,
          stats: { maxHp: 80, maxMp: 10, atk: 10, def: 8, mat: 5, mdf: 5, spd: 8 },
          learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
          jobLevels: { warrior: 1 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
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

  it('転職ボタンを押すと POST /api/job が呼ばれ、成功後に現在の職業が変わる', async () => {
    installFetchMock({
      'GET /api/me': [meResponse(500), meResponseAsMonk(500)],
      'GET /api/tavern': tavernResponse(),
      'POST /api/job': jsonResponse(200, {
        ok: true,
        data: { characterId: 'hero1', jobId: 'monk', jobLevel: 1, newSkillIds: [], newPassiveIds: [] },
      }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    // 「武闘家」の行だけに絞って転職ボタンを押す。他の職業にも同名のボタンが並ぶため。
    const monkRow = (await screen.findByText(/武闘家/)).closest('li');
    if (monkRow === null) throw new Error('武闘家の行が見つからない');
    await user.click(within(monkRow).getByRole('button', { name: '転職する' }));

    await screen.findByText(/ゆうしゃ（武闘家/);

    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST'
      && (typeof init.body === 'string') && init.body.includes('"jobId"'));
    expect(call?.[1]?.body).toBe(JSON.stringify({ characterId: 'hero1', jobId: 'monk' }));
  });

  it('条件を満たさない上級職は、条件つきで一覧に出るが押せない', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    // パラディンは戦士Lv20・僧侶Lv15が必要（設計書 §4.3）。unlockedJobIds に
    // 含まれていないので、条件だけ出て「転職する」ボタンは無い。
    const paladinText = await screen.findByText('パラディン — 戦士Lv20・僧侶Lv15が必要');
    const paladinRow = paladinText.closest('li');
    if (paladinRow === null) throw new Error('パラディンの行が見つからない');
    expect(within(paladinRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('次のレベルで覚える技をあと何レベルかで出す', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText(/ゆうしゃ/));

    // 戦士はジョブLv4で「挑発」を覚える。今はLv3なので、あと1レベル。
    expect(await screen.findByText('あと1レベルで「挑発」を習得します。')).toBeInTheDocument();
  });

  it('装備の更新は現在のアクティブ技とチェックした技を合わせてまとめて送る', async () => {
    installFetchMock({
      'GET /api/me': meResponseWithProvoke(500),
      'GET /api/tavern': tavernResponse(),
      'POST /api/equip': jsonResponse(200, {
        ok: true, data: { characterId: 'hero1', activeIds: ['slash', 'provoke'], passiveIds: [] },
      }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    await user.click(screen.getByLabelText('挑発をアクティブに装備'));
    await user.click(screen.getByRole('button', { name: '装備を更新する' }));

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST'
        && typeof init.body === 'string' && init.body.includes('"activeIds"'));
      expect(call?.[1]?.body).toBe(
        JSON.stringify({ characterId: 'hero1', activeIds: ['slash', 'provoke'], passiveIds: [] }),
      );
    });
  });

  it('主人公を解雇しようとするとサーバのエラーがそのまま出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
      'POST /api/dismiss': jsonResponse(400, { ok: false, error: 'cannot dismiss hero' }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    await user.click(screen.getByRole('button', { name: '解雇する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('cannot dismiss hero');
  });

  it('並べ替えの↑↓はPOST /api/partyに新しい並びを送る', async () => {
    installFetchMock({
      'GET /api/me': meResponseTwoMembers(500),
      'GET /api/tavern': tavernResponse(),
      'POST /api/party': jsonResponse(200, { ok: true, data: { order: ['hire1', 'hero1'] } }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText(/ゆうしゃ/);

    // 2人目（雇用メンバー）の「↑ 前へ」で、hero1 と入れ替わる。
    const upButtons = screen.getAllByRole('button', { name: '↑ 前へ' });
    await user.click(upButtons[1]);

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST'
        && typeof init.body === 'string' && init.body.includes('"order"'));
      expect(call?.[1]?.body).toBe(JSON.stringify({ order: ['hire1', 'hero1'] }));
    });
  });
});
