import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattlePlan, PartyMember } from '@mq/core';
import {
  ApiError, UnauthorizedError, fetchBattle, fetchWorld, submitBattle,
} from '../api.js';
import type { BattleInfo, BattleSubmitResult, WorldResult } from '../api.js';
import { resolveEvent } from '../events.js';
import { BattleResultView, MemberDetail, TurnGrid, freshPlan } from '../battlePlanner.js';
import type { PlanState } from '../battlePlanner.js';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; world: WorldResult; battle: BattleInfo };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: BattleSubmitResult };

/** 世界の履歴のうち、戦闘だった日（締まっている）だけを日付の昇順で返す（設計書 §4.2）。 */
function battleDayNumbers(world: WorldResult): number[] {
  return world.history
    .filter((day) => day.chosenId !== null && resolveEvent(day.chosenId).kind === 'battle')
    .map((day) => day.dayNo);
}

export function BattleScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [plan, setPlan] = useState<PlanState>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  // プランを作り直すのは「見ている日が変わったとき」だけにする。
  // 送信結果を反映するための再読み込み（無し・実際にはこの画面は再読み込みしないが
  // 将来の変更に備える）でも同じ日である限りプランを消さない（設計書 §4.5）。
  const planDayRef = useRef<number | null>(null);

  const reload = useCallback(
    async (dayNo?: number) => {
      setLoad({ kind: 'loading' });
      setSubmitState({ kind: 'idle' });
      try {
        const [world, battle] = await Promise.all([fetchWorld(token), fetchBattle(token, dayNo)]);
        setLoad({ kind: 'loaded', world, battle });
        if (battle.hasBattle && planDayRef.current !== battle.dayNo) {
          planDayRef.current = battle.dayNo;
          setPlan(freshPlan(battle.party));
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

  useEffect(() => {
    void reload();
  }, [reload]);

  function setTurnSkill(characterId: string, turnIndex: number, skillId: string | null): void {
    setPlan((prev) => ({
      ...prev,
      [characterId]: prev[characterId].map((value, i) => (i === turnIndex ? skillId : value)),
    }));
  }

  async function handleSubmit(): Promise<void> {
    if (load.kind !== 'loaded' || !load.battle.hasBattle) return;
    const dayNo = load.battle.dayNo;
    setSubmitState({ kind: 'submitting' });
    try {
      const result = await submitBattle(token, plan as BattlePlan, dayNo);
      setSubmitState({ kind: 'result', result });
      // 送信の応答が最新の勝敗・討伐状況そのものなので、読み直さずここで反映する。
      // 読み直すと一瞬「読み込み中」に戻ってプランの表示が消え、負けても
      // すぐ組み替えられるという設計書 §4.5 の体験を損なう。
      setLoad((prev) => {
        if (prev.kind !== 'loaded' || !prev.battle.hasBattle) return prev;
        return {
          ...prev,
          battle: {
            ...prev.battle,
            won: prev.battle.won || result.log.result === 'win',
            worldDefeated: result.worldDefeated,
          },
        };
      });
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
        <h1>戦闘</h1>
        <p>読み込み中…</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main>
        <h1>戦闘</h1>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { world, battle } = load;
  const days = battleDayNumbers(world);

  return (
    <main>
      <h1>戦闘</h1>
      <DaySelector currentDayNo={battle.dayNo} days={days} onSelect={(dayNo) => void reload(dayNo)} />

      {!battle.hasBattle && (
        <p>{battle.dayNo}日目は戦闘はありません。上の一覧から過去の戦闘を選べます。</p>
      )}

      {battle.hasBattle && (
        <BattleBody
          battle={battle}
          plan={plan}
          onChangeTurn={setTurnSkill}
          onSubmit={() => void handleSubmit()}
          submitState={submitState}
        />
      )}
    </main>
  );
}

function DaySelector({
  currentDayNo,
  days,
  onSelect,
}: {
  currentDayNo: number;
  days: readonly number[];
  onSelect: (dayNo: number) => void;
}) {
  return (
    <section>
      <p>いま見ているのは {currentDayNo}日目 です。</p>
      {days.length === 0 ? (
        <p>戦闘だった日はまだありません。</p>
      ) : (
        <label>
          戦闘だった日を選ぶ
          <select
            value={currentDayNo}
            onChange={(event) => onSelect(Number(event.target.value))}
          >
            {!days.includes(currentDayNo) && <option value={currentDayNo}>（戦闘ではない日）</option>}
            {days.map((dayNo) => (
              <option key={dayNo} value={dayNo}>
                {dayNo}日目
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function BattleBody({
  battle,
  plan,
  onChangeTurn,
  onSubmit,
  submitState,
}: {
  battle: Extract<BattleInfo, { hasBattle: true }>;
  plan: PlanState;
  onChangeTurn: (characterId: string, turnIndex: number, skillId: string | null) => void;
  onSubmit: () => void;
  submitState: SubmitState;
}) {
  const submitting = submitState.kind === 'submitting';

  return (
    <section>
      {battle.won && (
        <p role="status">
          この日はすでに勝利しています。挑み直せますが、報酬は入りません。
        </p>
      )}
      {battle.worldDefeated && (
        // 自分が倒した場合に「他の誰かが倒しました」と出ると事実と食い違う。
        // 誰が最初に倒したかまではAPIが返さないので、自分が勝っているかどうかで
        // 言い分けるに留める。断定できないことを断定しない。
        <p role="status">
          {battle.won
            ? 'この敵は世界としてすでに討伐されています。'
            : 'この敵は世界としてすでに討伐されています（他の誰かが倒しました）。'}
        </p>
      )}

      <h2>{battle.enemy.name} との戦い</h2>
      <TurnGrid
        enemy={battle.enemy}
        party={battle.party}
        plan={plan}
        onChangeTurn={onChangeTurn}
        disabled={submitting}
      />

      <h2>パーティ</h2>
      {battle.party.map((member: PartyMember) => (
        <MemberDetail key={member.id} member={member} />
      ))}

      <button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? '送信中…' : 'このプランで挑む'}
      </button>

      {submitState.kind === 'error' && <p role="alert">{submitState.message}</p>}
      {submitState.kind === 'result' && (
        <BattleResultView
          party={battle.party}
          enemy={battle.enemy}
          log={submitState.result.log}
          rewarded={submitState.result.rewarded}
          rewardedMessage="報酬が入りました。"
          notRewardedMessage="報酬は入りませんでした。"
        />
      )}
    </section>
  );
}
