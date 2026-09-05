import { useCallback, useEffect, useRef, useState } from 'react';
import { ARENA_FINAL_FLOOR } from '@mq/core';
import type { BattlePlan, Enemy } from '@mq/core';
import {
  ApiError, UnauthorizedError, fetchArena, fetchArenaRanking, submitArena,
} from '../api.js';
import type { ArenaRankingResult, ArenaResult, ArenaSubmitResult } from '../api.js';
import {
  BattleResultView, MemberDetail, TurnGrid, freshPlan,
} from '../battlePlanner.js';
import type { PlanState } from '../battlePlanner.js';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; arena: ArenaResult };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: ArenaSubmitResult };

/** 塔の一覧はいつでも見たいので、挑戦の読み込み状態とは別に持つ。 */
type RankingState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; ranking: ArenaRankingResult };

/** 塔の一覧。倒した階・いま挑める階・まだ見えない階を1行ずつ並べる（設計書 §6）。 */
function TowerList({
  floors,
  targetFloor,
  onSelect,
}: {
  floors: ArenaResult['floors'];
  targetFloor: number | null;
  onSelect: (floor: number) => void;
}) {
  return (
    <ul className="tower">
      {floors.map((floor) => {
        // 開いていない階は「まだ見えない」。裏ボス（20階）は19階を倒すまで
        // 名前どころか存在の手応えも出さない（設計書 §3.3・§6）。
        // ここでは floor 番号だけを見せ、中身は問わない。
        const cleared = floor.clearedAt !== null;
        const isTarget = floor.floor === targetFloor;
        return (
          <li key={floor.floor}>
            <button
              type="button"
              className="tower-floor"
              data-state={floor.opened ? (cleared ? 'cleared' : 'open') : 'unknown'}
              aria-pressed={isTarget}
              disabled={!floor.opened}
              onClick={() => onSelect(floor.floor)}
            >
              <span className="tower-floor-no">{floor.floor}階</span>
              <span className="tower-floor-state">
                {!floor.opened ? '？？？' : cleared ? '突破済み' : '挑戦可能'}
              </span>
              {/* API が返すのは playerId であって表示名ではない
                  （worker/src/routes/arena.ts）。名前の解決は「みんなの到達階」
                  （ranking）側の役目なので、ここでは「誰かが最初に突破した」
                  という事実だけを示す。 */}
              {floor.opened && floor.firstClearedBy !== null && (
                <span className="tower-floor-first">世界で最初に突破した人がいます</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 世界の全員の到達階。個人戦だが「みんなで」の遊びなので常に見える（設計書 §6）。 */
function RankingList({ state }: { state: RankingState }) {
  if (state.kind === 'loading') return <p>読み込み中…</p>;
  if (state.kind === 'error') return <p role="alert">{state.message}</p>;
  if (state.ranking.ranking.length === 0) return <p>まだ誰も挑んでいません。</p>;
  return (
    <ol>
      {state.ranking.ranking.map((row) => (
        <li key={row.playerId}>
          {row.name}: {row.reachedFloor}階
        </li>
      ))}
    </ol>
  );
}

export function ArenaScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [ranking, setRanking] = useState<RankingState>({ kind: 'loading' });
  const [plan, setPlan] = useState<PlanState>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  // プランを作り直すのは「見ている階が変わったとき」だけにする。負けても
  // プランを残すのがこの画面の狙いなので（設計書「勝てるまで並びを組み替える」）、
  // 送信結果の反映では消さない。BattleScreen の planDayRef と同じ考え方。
  const planFloorRef = useRef<number | null>(null);

  const reload = useCallback(
    async (floor?: number) => {
      setLoad({ kind: 'loading' });
      setSubmitState({ kind: 'idle' });
      try {
        const arena = await fetchArena(token, floor);
        setLoad({ kind: 'loaded', arena });
        if (arena.targetFloor !== null && arena.enemy !== null && planFloorRef.current !== arena.targetFloor) {
          planFloorRef.current = arena.targetFloor;
          setPlan(freshPlan(arena.party));
        }
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        const message = error instanceof ApiError ? error.message : '通信に失敗しました';
        setLoad({ kind: 'error', message });
      }
    },
    [token, onUnauthorized],
  );

  const reloadRanking = useCallback(async () => {
    setRanking({ kind: 'loading' });
    try {
      const result = await fetchArenaRanking(token);
      setRanking({ kind: 'loaded', ranking: result });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setRanking({ kind: 'error', message });
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void reload();
    void reloadRanking();
  }, [reload, reloadRanking]);

  function setTurnSkill(characterId: string, turnIndex: number, skillId: string | null): void {
    setPlan((prev) => ({
      ...prev,
      [characterId]: prev[characterId].map((value, i) => (i === turnIndex ? skillId : value)),
    }));
  }

  async function handleSubmit(): Promise<void> {
    if (load.kind !== 'loaded' || load.arena.targetFloor === null) return;
    const floor = load.arena.targetFloor;
    setSubmitState({ kind: 'submitting' });
    try {
      const result = await submitArena(token, floor, plan as BattlePlan);
      setSubmitState({ kind: 'result', result });
      // 勝敗をその場で反映する。BattleScreen と同じ理由で reload はしない
      // （reload は submitState を idle に戻すので、結果表示が一瞬で消えてしまう。
      // 負けてもプランが残るのが狙いなので、読み直しに頼らず自前で状態を進める）。
      if (result.log.result === 'win' && floor === load.arena.reachedFloor + 1) {
        setLoad((prev) => {
          if (prev.kind !== 'loaded') return prev;
          const nextChallengeFloor = floor >= ARENA_FINAL_FLOOR ? null : floor + 1;
          return {
            kind: 'loaded',
            arena: {
              ...prev.arena,
              reachedFloor: floor,
              challengeFloor: nextChallengeFloor,
              floors: prev.arena.floors.map((f) => {
                if (f.floor === floor) {
                  // firstClearedBy は表示上「誰かが最初に突破したか」の真偽にしか
                  // 使わないので、実際のIDでなくても構わない（サーバには送らない）。
                  return {
                    ...f,
                    clearedAt: f.clearedAt ?? new Date().toISOString(),
                    firstClearedBy: result.firstClear ? 'me' : f.firstClearedBy,
                  };
                }
                if (f.floor === nextChallengeFloor) {
                  return { ...f, opened: true };
                }
                return f;
              }),
            },
          };
        });
        void reloadRanking();
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setSubmitState({ kind: 'error', message });
    }
  }

  if (load.kind === 'loading') {
    return (
      <main>
        <h1>闘技場</h1>
        <p>読み込み中…</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main>
        <h1>闘技場</h1>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { arena } = load;
  const submitting = submitState.kind === 'submitting';

  return (
    <main>
      <h1>闘技場</h1>
      <p>
        到達階: {arena.reachedFloor}階
        {arena.challengeFloor !== null && `（次は${arena.challengeFloor}階に挑戦できます）`}
        {arena.challengeFloor === null && '（塔の頂まで踏破しました）'}
      </p>

      <section>
        <h2>塔</h2>
        <TowerList floors={arena.floors} targetFloor={arena.targetFloor} onSelect={(floor) => void reload(floor)} />
      </section>

      {arena.targetFloor === null && (
        <p>この階はまだ開いていません。1つ手前の階を突破すると挑めるようになります。</p>
      )}

      {arena.targetFloor !== null && arena.enemy !== null && (
        <ArenaBattle
          arena={{ ...arena, enemy: arena.enemy, targetFloor: arena.targetFloor }}
          plan={plan}
          onChangeTurn={setTurnSkill}
          onSubmit={() => void handleSubmit()}
          submitState={submitState}
          submitting={submitting}
        />
      )}

      <section>
        <h2>みんなの到達階</h2>
        <RankingList state={ranking} />
      </section>
    </main>
  );
}

function ArenaBattle({
  arena,
  plan,
  onChangeTurn,
  onSubmit,
  submitState,
  submitting,
}: {
  arena: Omit<ArenaResult, 'enemy' | 'targetFloor'> & { enemy: Enemy; targetFloor: number };
  plan: PlanState;
  onChangeTurn: (characterId: string, turnIndex: number, skillId: string | null) => void;
  onSubmit: () => void;
  submitState: SubmitState;
  submitting: boolean;
}) {
  const enemy = arena.enemy;
  // すでにこの階を突破しているかどうか（塔の一覧の同じ階から引く）。
  // 何度でも挑めるが2回目以降は報酬が入らないので、その旨を先に出しておく
  // （設計書 §2「勝てるまで並びを組み替えるためであって、稼ぐためではない」）。
  const floorSummary = arena.floors.find((f) => f.floor === arena.targetFloor);
  const alreadyCleared = (floorSummary?.clearedAt ?? null) !== null;

  return (
    <section>
      {alreadyCleared && (
        <p role="status">
          この階はすでに突破済みです。挑み直せますが、報酬は入りません。
        </p>
      )}

      <h2>{enemy.name} との戦い</h2>
      <TurnGrid enemy={enemy} party={arena.party} plan={plan} onChangeTurn={onChangeTurn} disabled={submitting} />

      <h2>パーティ</h2>
      {arena.party.map((member) => (
        <MemberDetail key={member.id} member={member} />
      ))}

      <button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? '送信中…' : 'このプランで挑む'}
      </button>

      {submitState.kind === 'error' && <p role="alert">{submitState.message}</p>}
      {submitState.kind === 'result' && (
        <BattleResultView
          party={arena.party}
          enemy={enemy}
          log={submitState.result.log}
          rewarded={submitState.result.rewarded}
          rewardedMessage="報酬が入りました。"
          notRewardedMessage="報酬は入りませんでした。"
        >
          {submitState.result.firstClear && (
            <p role="status">この階を世界で最初に突破しました。</p>
          )}
        </BattleResultView>
      )}
    </section>
  );
}
