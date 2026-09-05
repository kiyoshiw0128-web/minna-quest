import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Enemy, PartyMember, Skill } from '@mq/core';
import { ArenaScreen } from '../src/screens/ArenaScreen.js';
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
  id: 'arenaAspirant', name: '闘技場の新兵',
  stats: { maxHp: 80, maxMp: 0, atk: 10, def: 5, mat: 5, mdf: 5, spd: 8 },
  skills: [SLASH],
  pattern: [{ skillId: 'slash' }],
};

/** 3階までの塔。1階は突破済み、2階が挑戦可能、3階以降は未到達。 */
function floorsUpTo(opened: number, cleared: number): Array<{
  floor: number; opened: boolean; clearedAt: string | null; firstClearedBy: string | null;
}> {
  return Array.from({ length: 20 }, (_, i) => {
    const floor = i + 1;
    return {
      floor,
      opened: floor <= opened,
      clearedAt: floor <= cleared ? '2026-01-01T00:00:00.000Z' : null,
      firstClearedBy: floor <= cleared ? 'someone' : null,
    };
  });
}

function rankingResponse() {
  return jsonResponse(200, {
    ok: true,
    data: { ranking: [{ playerId: 'p1', name: 'きよし', reachedFloor: 1 }] },
  });
}

function arenaResponse(overrides: Partial<{
  reachedFloor: number;
  challengeFloor: number | null;
  targetFloor: number | null;
  enemy: Enemy | null;
}> = {}) {
  const reachedFloor = overrides.reachedFloor ?? 1;
  const targetFloor = overrides.targetFloor === undefined ? 2 : overrides.targetFloor;
  return jsonResponse(200, {
    ok: true,
    data: {
      reachedFloor,
      challengeFloor: overrides.challengeFloor === undefined ? reachedFloor + 1 : overrides.challengeFloor,
      floors: floorsUpTo(reachedFloor + 1, reachedFloor),
      targetFloor,
      enemy: overrides.enemy === undefined ? ENEMY : overrides.enemy,
      party: [HERO],
    },
  });
}

describe('塔の一覧（設計書 §3・§6）', () => {
  it('突破済み・挑戦可能・未到達が区別して出る', async () => {
    installFetchMock({
      'GET /api/arena': arenaResponse(),
      'GET /api/arena/ranking': rankingResponse(),
    });

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('塔');

    const floor1 = screen.getByText('1階').closest('button') as HTMLElement;
    expect(within(floor1).getByText('突破済み')).toBeInTheDocument();

    const floor2 = screen.getByText('2階').closest('button') as HTMLElement;
    expect(within(floor2).getByText('挑戦可能')).toBeInTheDocument();

    const floor3 = screen.getByText('3階').closest('button') as HTMLElement;
    expect(within(floor3).getByText('？？？')).toBeInTheDocument();
    expect(floor3).toBeDisabled();
  });
});

describe('裏ボス（設計書 §3.3・§6・§8 テスト5）', () => {
  it('19階を倒すまで20階は名前も出さず「？？？」のまま', async () => {
    // 到達階18（19階はまだクリアしていない）。20階は開いていないので enemy は null。
    installFetchMock({
      'GET /api/arena': arenaResponse({ reachedFloor: 18, targetFloor: null, enemy: null }),
      'GET /api/arena/ranking': rankingResponse(),
    });

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('塔');

    // 20階が開いていない（挑めない）ことをタワーの行から確認する。
    const floor20 = screen.getByText('20階').closest('button') as HTMLElement;
    expect(floor20).toBeDisabled();
    expect(within(floor20).getByText('？？？')).toBeInTheDocument();

    // 敵の名前がどこにも出ない（行動表そのものが描画されない）。
    expect(screen.queryByText(/との戦い/)).not.toBeInTheDocument();
    expect(screen.getByText(/まだ開いていません/)).toBeInTheDocument();
  });
});

describe('プランを組む・敵の行動表と並ぶ', () => {
  it('挑戦可能な階の行動表とプランが8ターンぶん並ぶ', async () => {
    installFetchMock({
      'GET /api/arena': arenaResponse(),
      'GET /api/arena/ranking': rankingResponse(),
    });

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const enemyRow = screen.getByText('通常').closest('tr') as HTMLElement;
    expect(within(enemyRow).getAllByRole('cell')).toHaveLength(8);

    const planRow = screen.getByText('ゆうしゃ').closest('tr') as HTMLElement;
    expect(within(planRow).getAllByRole('combobox')).toHaveLength(8);
  });
});

describe('送信・再挑戦（設計書 §2「勝てるまで並びを組み替える」）', () => {
  it('負けてもプランが残る', async () => {
    installFetchMock({
      'GET /api/arena': arenaResponse(),
      'GET /api/arena/ranking': rankingResponse(),
      'POST /api/arena': jsonResponse(200, {
        ok: true,
        data: {
          log: { result: 'lose', turns: 1, events: [{ t: 'turnStart', turn: 1 }, { t: 'end', result: 'lose', turns: 1 }] },
          rewarded: false,
          firstClear: false,
        },
      }),
    });
    const user = userEvent.setup();

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    const turn1 = screen.getByLabelText('ゆうしゃ のターン1') as HTMLSelectElement;
    await user.selectOptions(turn1, 'slash');
    expect(turn1.value).toBe('slash');

    await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));
    await waitFor(() => expect(screen.getByText(/報酬は入りませんでした/)).toBeInTheDocument());

    expect((screen.getByLabelText('ゆうしゃ のターン1') as HTMLSelectElement).value).toBe('slash');
  });

  it('勝つと初回撃破のメッセージが出る', async () => {
    installFetchMock({
      'GET /api/arena': arenaResponse(),
      'GET /api/arena/ranking': rankingResponse(),
      'POST /api/arena': jsonResponse(200, {
        ok: true,
        data: {
          log: { result: 'win', turns: 1, events: [{ t: 'end', result: 'win', turns: 1 }] },
          rewarded: true,
          firstClear: true,
        },
      }),
    });
    const user = userEvent.setup();

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);
    await screen.findByText('プラン（8ターン）');

    await user.click(screen.getByRole('button', { name: 'このプランで挑む' }));

    await waitFor(() => expect(screen.getByText(/世界で最初に突破しました/)).toBeInTheDocument());
    expect(screen.getByText(/報酬が入りました/)).toBeInTheDocument();
  });
});

describe('みんなの到達階（設計書 §6「他の人がどこまで登ったか」）', () => {
  it('世界の全員の到達階が出る', async () => {
    installFetchMock({
      'GET /api/arena': arenaResponse(),
      'GET /api/arena/ranking': jsonResponse(200, {
        ok: true,
        data: { ranking: [{ playerId: 'p1', name: 'きよし', reachedFloor: 5 }, { playerId: 'p2', name: 'はなこ', reachedFloor: 2 }] },
      }),
    });

    render(<ArenaScreen token="t" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/きよし: 5階/)).toBeInTheDocument();
    expect(screen.getByText(/はなこ: 2階/)).toBeInTheDocument();
  });
});
