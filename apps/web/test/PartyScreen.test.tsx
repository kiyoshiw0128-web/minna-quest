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
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
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
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
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
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
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
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
          jobLevels: { warrior: 3 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
        {
          id: 'hire1', name: 'たろう', jobId: 'warrior', adventureLevel: 1, jobLevel: 1,
          stats: { maxHp: 80, maxMp: 10, atk: 10, def: 8, mat: 5, mdf: 5, spd: 8 },
          learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
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

/**
 * 段階8・設計書 §6。品揃えは全員共通なので、装備を検証しないテストでは
 * 中身が空でも成立する。GET /api/shop も PartyScreen が読み込み時に必ず
 * 呼ぶため、全ての installFetchMock に含めておく必要がある。
 */
function shopResponse() {
  return jsonResponse(200, { ok: true, data: { items: [] } });
}

describe('仲間画面（設計書 §5）', () => {
  it('所持金・パーティ・酒場の3人が出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText('所持金: 500 ゴールド')).toBeInTheDocument();
    expect(screen.getByText(/ゆうしゃ/)).toBeInTheDocument();
    expect(screen.getByText(/たろう/)).toBeInTheDocument();
    // 素質はA〜Eのまま出る（数字に直さない）。
    // 素質は項目名と等級を別の要素に分けて格子で出す。1行に流すと7項目を目で追えない。
    const aptitude = document.querySelector('.aptitude');
    expect(aptitude).not.toBeNull();
    expect(aptitude?.textContent).toContain('HP');
    expect(aptitude?.querySelector('[data-grade="A"]')).not.toBeNull();
  });

  it('金貨不足で雇えないとき、サーバの文言がそのまま出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(0),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
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
        if (method === 'GET' && url === '/api/shop') return shopResponse();
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
      'GET /api/shop': shopResponse(),
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
      'GET /api/shop': shopResponse(),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    // パラディンは戦士Lv20・僧侶Lv15が必要（設計書 §4.3）。unlockedJobIds に
    // 含まれていないので、条件だけ出て「転職する」ボタンは無い。
    const paladinName = await screen.findByText('パラディン');
    const paladinRow = paladinName.closest('li');
    if (paladinRow === null) throw new Error('パラディンの行が見つからない');
    expect(paladinRow.textContent).toContain('戦士Lv20・僧侶Lv15が必要');
    expect(within(paladinRow).queryByRole('button')).not.toBeInTheDocument();
    // 就ける職業とは別の一覧に置く。混ぜると押せる行と押せない行が交互に来る。
    expect(paladinRow.closest('.joblist.locked')).not.toBeNull();
  });

  it('次のレベルで覚える技をあと何レベルかで出す', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
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
      'GET /api/shop': shopResponse(),
      'POST /api/equip': jsonResponse(200, {
        ok: true, data: { characterId: 'hero1', activeIds: ['slash', 'provoke'], passiveIds: [] },
      }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    await user.click(screen.getByLabelText('挑発をアクティブに装備'));
    // 段階8で武器・防具の装備パネルにも同名のボタンが増えたため、
    // 先に描画されるアクティブ技/パッシブの装備パネル側（1つ目）を狙う。
    await user.click(screen.getAllByRole('button', { name: '装備を更新する' })[0]);

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
      'GET /api/shop': shopResponse(),
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
      'GET /api/shop': shopResponse(),
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

/**
 * 装備の更新でパッシブが消えないことの検査。
 *
 * GET /api/me がパッシブを返していなかったため、画面は「いま何を装備して
 * いるか」を知らないまま更新を送っていた。アクティブだけ直して更新すると、
 * 触っていないパッシブが空で上書きされて消える状態だった。
 */
describe('装備の更新でパッシブが消えない', () => {
  it('パッシブを触らずにアクティブだけ変えても、パッシブは保たれる', async () => {
    installFetchMock({
      'GET /api/me': jsonResponse(200, {
        ok: true,
        data: {
          name: 'きよし', gold: 0,
          party: [{
            id: 'c1', name: 'きよし', jobId: 'warrior', adventureLevel: 5, jobLevel: 5,
            stats: { maxHp: 200, maxMp: 40, atk: 30, def: 20, mat: 15, mdf: 15, spd: 12 },
            learnedSkillIds: ['slash', 'provoke'], equippedSkillIds: ['slash'],
            learnedPassiveIds: ['ironSkin'], equippedPassiveIds: ['ironSkin'],
            isHero: true,
            jobLevels: { warrior: 5 }, unlockedJobIds: ['warrior'],
          }],
        },
      }),
      'GET /api/tavern': jsonResponse(200, { ok: true, data: { dayNo: 1, recruits: [] } }),
      'GET /api/shop': shopResponse(),
      'POST /api/equip': jsonResponse(200, { ok: true, data: {} }),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText(/所持金/);

    // アクティブ技をもう1つ足すだけ。パッシブには触らない。
    await userEvent.click(screen.getByLabelText(/挑発をアクティブに装備/));
    // 段階8の武器・防具パネルにも同名ボタンが増えたため、1つ目（アクティブ/
    // パッシブの装備パネル）を狙う。
    await userEvent.click(screen.getAllByRole('button', { name: '装備を更新する' })[0]);

    const call = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .find((c) => String(c[0]).includes('/api/equip') && !String(c[0]).includes('/api/equip-item'));
    const body = JSON.parse(String((call?.[1] as RequestInit).body));
    expect(body.passiveIds).toEqual(['ironSkin']);
  });
});

/**
 * ペット欄（段階6・設計書 §7）。既存の meResponse には pets/activePetId が
 * 無いので、それが起きても画面が壊れない（空扱いで済む）ことも合わせて見る。
 */
function meResponseWithPets(activePetId: string | null) {
  return jsonResponse(200, {
    ok: true,
    data: {
      name: 'いちろう',
      gold: 500,
      party: [
        {
          id: 'hero1', name: 'ゆうしゃ', jobId: 'warrior', adventureLevel: 3, jobLevel: 3,
          stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
          learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
          learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
          jobLevels: { warrior: 3 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
        },
      ],
      pets: ['puppy', 'kitten'],
      activePetId,
    },
  });
}

describe('ペット欄（設計書 §7）', () => {
  it('持っているペットの名前・説明・効果が出て、連れているペットが分かる', async () => {
    installFetchMock({
      'GET /api/me': meResponseWithPets('puppy'),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);

    // 効果を数字で出す（設計書 §7「曖昧にしない」）。puppy は atk +15%。
    expect(await screen.findByText('効果: ATK +15%')).toBeInTheDocument();
    expect(await screen.findByText(/忠実に主人を守ろうとする/)).toBeInTheDocument();

    const puppyRow = (await screen.findByText('迷子の子犬モモ')).closest('li');
    if (puppyRow === null) throw new Error('puppy の行が見つからない');
    expect(within(puppyRow).getByText(/連れている/)).toBeInTheDocument();
    // 連れている本人には「連れる」ボタンを出さない。
    expect(within(puppyRow).queryByRole('button', { name: '連れる' })).not.toBeInTheDocument();

    const kittenRow = (await screen.findByText('路地裏の子猫ラン')).closest('li');
    if (kittenRow === null) throw new Error('kitten の行が見つからない');
    expect(within(kittenRow).getByRole('button', { name: '連れる' })).toBeInTheDocument();
  });

  it('別のペットの「連れる」を押すと POST /api/pet が呼ばれ、連れ替わる', async () => {
    installFetchMock({
      'GET /api/me': [meResponseWithPets('puppy'), meResponseWithPets('kitten')],
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
      'POST /api/pet': jsonResponse(200, { ok: true, data: { activePetId: 'kitten' } }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    const kittenRow = (await screen.findByText('路地裏の子猫ラン')).closest('li');
    if (kittenRow === null) throw new Error('kitten の行が見つからない');
    await user.click(within(kittenRow).getByRole('button', { name: '連れる' }));

    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST'
      && typeof init.body === 'string' && init.body.includes('petId'));
    expect(call?.[1]?.body).toBe(JSON.stringify({ petId: 'kitten' }));

    // 読み直し後、連れているのが kitten に変わる。
    const updatedKittenRow = (await screen.findByText('路地裏の子猫ラン')).closest('li');
    if (updatedKittenRow === null) throw new Error('kitten の行が見つからない');
    expect(within(updatedKittenRow).getByText(/連れている/)).toBeInTheDocument();
  });

  it('ペットを一度も持っていなければ、その旨を出す', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    expect(await screen.findByText('まだペットに出会っていません。')).toBeInTheDocument();
  });
});

/**
 * ペットが要る技は、戦闘前にそれと分からないと、連れ忘れたまま挑むことになる。
 * 戦闘中に「ペットを連れていない」と出るのは、気づく場所として遅すぎる。
 */
describe('ペットが要る技の表示', () => {
  it('装備の一覧で「要ペット」と分かる', async () => {
    installFetchMock({
      'GET /api/me': jsonResponse(200, {
        ok: true,
        data: {
          name: 'きよし', gold: 0, pets: [], activePetId: null,
          party: [{
            id: 'c1', name: 'きよし', jobId: 'beastTamer', adventureLevel: 20, jobLevel: 20,
            stats: { maxHp: 300, maxMp: 60, atk: 60, def: 30, mat: 20, mdf: 25, spd: 20 },
            learnedSkillIds: ['petFang'], equippedSkillIds: ['petFang'],
            learnedPassiveIds: [], equippedPassiveIds: [], isHero: true,
            jobLevels: { beastTamer: 20 }, unlockedJobIds: ['beastTamer'],
          }],
        },
      }),
      'GET /api/tavern': jsonResponse(200, { ok: true, data: { dayNo: 1, recruits: [] } }),
      'GET /api/shop': shopResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText(/所持金/);
    expect(screen.getByText(/要ペット/)).toBeInTheDocument();
  });
});

/** 段階8・設計書 §6・§7。店の一覧と、値段・効果・買えない理由の表示。 */
describe('店（設計書 §6・§7）', () => {
  function shopWithRustedSword() {
    return jsonResponse(200, {
      ok: true,
      data: {
        items: [{ id: 'rustedSword', name: '錆びた剣', slot: 'weapon', cost: 100, mods: { atk: 3 } }],
      },
    });
  }

  it('値段と効果が出て、金貨が足りなければ買えない理由が出る', async () => {
    installFetchMock({
      'GET /api/me': meResponse(50),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopWithRustedSword(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    expect(await screen.findByText(/錆びた剣/)).toBeInTheDocument();
    expect(screen.getByText(/ATK \+3/)).toBeInTheDocument();
    // 値段は「100G」、足りない場合は不足額を添える。同じ文言を品数だけ
    // 並べると1回も読まれないので、押せるかどうかで買えないことを示す。
    expect(screen.getByText('100G', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/あと50/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '買う' })).toBeDisabled();
  });

  it('金貨が足りれば買える。押すとPOST /api/buyが飛ぶ', async () => {
    installFetchMock({
      'GET /api/me': meResponse(500),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopWithRustedSword(),
      'POST /api/buy': jsonResponse(200, { ok: true, data: { itemId: 'rustedSword', cost: 100 } }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    const buyButton = await screen.findByRole('button', { name: '買う' });
    expect(buyButton).toBeEnabled();
    await user.click(buyButton);

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST'
        && typeof init.body === 'string' && init.body.includes('rustedSword'));
      expect(call).toBeDefined();
    });
  });
});

/** 段階8・設計書 §7。武器・防具の装備パネル。 */
describe('装備パネル（設計書 §7）', () => {
  function meWithOwnedSword(equippedWeaponId: string | null) {
    return jsonResponse(200, {
      ok: true,
      data: {
        name: 'いちろう',
        gold: 500,
        items: ['rustedSword'],
        party: [
          {
            id: 'hero1', name: 'ゆうしゃ', jobId: 'warrior', adventureLevel: 3, jobLevel: 3,
            stats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
            baseStats: { maxHp: 100, maxMp: 20, atk: 15, def: 10, mat: 10, mdf: 10, spd: 12 },
            learnedSkillIds: ['slash'], equippedSkillIds: ['slash'],
            learnedPassiveIds: [], equippedPassiveIds: [], isHero: false,
            jobLevels: { warrior: 3 }, unlockedJobIds: ['warrior', 'monk', 'mage', 'priest', 'thief', 'ranger'],
            equippedWeaponId, equippedArmorId: null,
          },
        ],
      },
    });
  }

  it('持っている武器が一覧に出て、選んで更新するとPOST /api/equip-itemが飛ぶ', async () => {
    installFetchMock({
      'GET /api/me': meWithOwnedSword(null),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
      'POST /api/equip-item': jsonResponse(200, {
        ok: true, data: { characterId: 'hero1', weaponId: 'rustedSword', armorId: null },
      }),
    });
    const user = userEvent.setup();

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByText(/ゆうしゃ/));

    await user.click(screen.getByLabelText(/錆びた剣/));
    // 装備パネル側の「装備を更新する」（アクティブ/パッシブのパネルより後に描画される2つ目）。
    await user.click(screen.getAllByRole('button', { name: '装備を更新する' })[1]);

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, init]) => init?.method === 'POST'
        && String(url).includes('/api/equip-item')
        && typeof init.body === 'string' && init.body.includes('rustedSword'));
      expect(call).toBeDefined();
    });
  });

  it('既に装備している武器は、他キャラの装備状況に関わらず選び直せる', async () => {
    installFetchMock({
      'GET /api/me': meWithOwnedSword('rustedSword'),
      'GET /api/tavern': tavernResponse(),
      'GET /api/shop': shopResponse(),
    });

    render(<PartyScreen token="t" onUnauthorized={vi.fn()} />);
    await userEvent.click(await screen.findByText(/ゆうしゃ/));

    const swordOption = screen.getByLabelText(/錆びた剣/) as HTMLInputElement;
    expect(swordOption.checked).toBe(true);
    expect(swordOption).not.toBeDisabled();
  });
});
