import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MAX_TURNS } from '@mq/core';
import type { BattlePlan, DamageSpec, Element, PartyMember, Skill } from '@mq/core';
import {
  ApiError, UnauthorizedError, fetchBattle, fetchWorld, submitBattle,
} from '../api.js';
import type { BattleInfo, BattleSubmitResult, WorldResult } from '../api.js';
import { resolveEvent } from '../events.js';
import { groupBattleLog, summarizeResult } from '../battleLog.js';
import type { NameTable, SkillNameTable } from '../battleLog.js';

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

/** characterId -> 8ターンぶんの技ID（未選択は null）。 */
type PlanState = Record<string, (string | null)[]>;

const ELEMENT_LABEL: Record<Element, string> = {
  none: 'なし', fire: '火', ice: '氷', thunder: '雷', holy: '光', dark: '闇',
};

/** 技の「威力」欄。種別によって単位が違うので、ここで人が読める1つの文字列にする。 */
function damageLabel(damage: DamageSpec | undefined): string {
  if (damage === undefined) return '-';
  switch (damage.kind) {
    case 'physical':
      return `物理 ${damage.power}`;
    case 'magical':
      return `魔法 ${damage.power}`;
    case 'fixed':
      return `固定 ${damage.amount}`;
    case 'ratio':
      return `残HPの${damage.percent}%（上限${damage.cap}）`;
  }
}

function freshPlan(party: readonly PartyMember[]): PlanState {
  const plan: PlanState = {};
  for (const member of party) {
    plan[member.id] = Array.from({ length: DEFAULT_MAX_TURNS }, () => null);
  }
  return plan;
}

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
  const turns = Array.from({ length: DEFAULT_MAX_TURNS }, (_, i) => i);
  const submitting = submitState.kind === 'submitting';

  return (
    <section>
      {battle.won && (
        <p role="status">
          この日はすでに勝利しています。挑み直せますが、報酬は入りません。
        </p>
      )}
      {battle.worldDefeated && (
        <p role="status">この敵は世界としてすでに討伐されています（他の誰かが倒しました）。</p>
      )}

      <h2>{battle.enemy.name} の行動表</h2>
      <EnemyTable enemy={battle.enemy} turns={turns} />

      <h2>パーティ</h2>
      {battle.party.map((member) => (
        <MemberDetail key={member.id} member={member} />
      ))}

      <h2>プラン（8ターン）</h2>
      <PlanTable party={battle.party} plan={plan} turns={turns} onChangeTurn={onChangeTurn} disabled={submitting} />

      <button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? '送信中…' : 'このプランで挑む'}
      </button>

      {submitState.kind === 'error' && <p role="alert">{submitState.message}</p>}
      {submitState.kind === 'result' && (
        <BattleResultView battle={battle} result={submitState.result} />
      )}
    </section>
  );
}

function EnemyTable({
  enemy,
  turns,
}: {
  enemy: Extract<BattleInfo, { hasBattle: true }>['enemy'];
  turns: readonly number[];
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <caption>行動表はターン数で循環する。HPが一定割合以下になると激昂し、下の表に切り替わる。</caption>
        <tbody>
          <PatternRow label="通常" pattern={enemy.pattern} turns={turns} />
          {enemy.enrage !== undefined && (
            <PatternRow
              label={`激昂後（HP${Math.round(enemy.enrage.hpRate * 100)}%以下）`}
              pattern={enemy.enrage.pattern}
              turns={turns}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

function PatternRow({
  label,
  pattern,
  turns,
}: {
  label: string;
  pattern: readonly { skillId: string }[];
  turns: readonly number[];
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {turns.map((turn) => (
        <td key={turn}>{pattern[turn % pattern.length]?.skillId ?? '-'}</td>
      ))}
    </tr>
  );
}

/** 各人のステータスと、装備中の技のMP・クールダウン・威力・属性（設計書 §4.3）。 */
function MemberDetail({ member }: { member: PartyMember }) {
  return (
    <details open>
      <summary>
        {member.name}（HP {member.stats.maxHp} / MP {member.stats.maxMp} / ATK {member.stats.atk} / DEF {member.stats.def} /
        {' '}MAT {member.stats.mat} / MDF {member.stats.mdf} / SPD {member.stats.spd}）
      </summary>
      <table>
        <thead>
          <tr>
            <th scope="col">技</th>
            <th scope="col">MP</th>
            <th scope="col">クールダウン</th>
            <th scope="col">威力</th>
            <th scope="col">属性</th>
          </tr>
        </thead>
        <tbody>
          {member.skills.map((skill: Skill) => (
            <tr key={skill.id}>
              <td>{skill.name}</td>
              <td>{skill.mpCost}</td>
              <td>{skill.cooldown === 0 ? '無し' : `${skill.cooldown}ターン`}</td>
              <td>{damageLabel(skill.damage)}</td>
              <td>{ELEMENT_LABEL[skill.element]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** 行が味方、列がターン1〜8。敵の行動表と同じ列数で並べる（設計書 §4.3）。 */
function PlanTable({
  party,
  plan,
  turns,
  onChangeTurn,
  disabled,
}: {
  party: readonly PartyMember[];
  plan: PlanState;
  turns: readonly number[];
  onChangeTurn: (characterId: string, turnIndex: number, skillId: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th scope="col">名前</th>
            {turns.map((turn) => (
              <th scope="col" key={turn}>
                ターン{turn + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {party.map((member) => (
            <tr key={member.id}>
              <th scope="row">{member.name}</th>
              {turns.map((turn) => (
                <td key={turn}>
                  <select
                    aria-label={`${member.name} のターン${turn + 1}`}
                    value={plan[member.id]?.[turn] ?? ''}
                    disabled={disabled}
                    onChange={(event) => onChangeTurn(member.id, turn, event.target.value === '' ? null : event.target.value)}
                  >
                    <option value="">何もしない</option>
                    {member.skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BattleResultView({
  battle,
  result,
}: {
  battle: Extract<BattleInfo, { hasBattle: true }>;
  result: BattleSubmitResult;
}) {
  const names: NameTable = new Map([
    ...battle.party.map((member): [string, string] => [member.id, member.name]),
    [battle.enemy.id, battle.enemy.name],
  ]);
  const skillNames: SkillNameTable = new Map([
    ...battle.party.flatMap((member) => member.skills.map((skill): [string, string] => [skill.id, skill.name])),
    ...battle.enemy.skills.map((skill): [string, string] => [skill.id, skill.name]),
  ]);
  const groups = groupBattleLog(result.log.events, names, skillNames);

  return (
    <section>
      <h3>結果: {summarizeResult(result.log.events)}</h3>
      <p>{result.rewarded ? '報酬が入りました。' : '報酬は入りませんでした。'}</p>
      {groups.map((group) => (
        <div key={group.turn}>
          <h4>ターン{group.turn}</h4>
          <ul>
            {group.lines.map((line, i) => (
              // 同一ターン内で同文が複数回起きうる（例: 全体攻撃で複数人が同じダメージ表記）ため、
              // key はインデックスに頼らざるを得ない。この配列はターンごとに作り直されるので害はない。
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
