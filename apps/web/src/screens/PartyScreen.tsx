import { useCallback, useEffect, useState } from 'react';
import { JOBS, SKILLS } from '@mq/core';
import type { Recruit } from '@mq/core';
import {
  ApiError, UnauthorizedError, fetchMe, fetchTavern, hireRecruit,
} from '../api.js';
import type { MeResult, MePartyMember, TavernResult } from '../api.js';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; me: MeResult; tavern: TavernResult };

/** 雇用は同時に1件まで。複数のボタンを連打されても二重に送らせない。 */
type HireState = { kind: 'idle' } | { kind: 'hiring'; recruitId: string } | { kind: 'error'; message: string };

function jobName(jobId: string): string {
  return JOBS[jobId as keyof typeof JOBS]?.name ?? jobId;
}

function skillName(skillId: string): string {
  return SKILLS[skillId as keyof typeof SKILLS]?.name ?? skillId;
}

/** 酒場とパーティを1画面にまとめる（設計書 §3 — 別タブだと雇うたびに行き来することになる）。 */
export function PartyScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [hireState, setHireState] = useState<HireState>({ kind: 'idle' });

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const [me, tavern] = await Promise.all([fetchMe(token), fetchTavern(token)]);
      setLoad({ kind: 'loaded', me, tavern });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setLoad({ kind: 'error', message });
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleHire(recruit: Recruit): Promise<void> {
    setHireState({ kind: 'hiring', recruitId: recruit.id });
    try {
      await hireRecruit(token, recruit.id);
      setHireState({ kind: 'idle' });
      await reload();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      // 金貨不足・パーティ満杯はサーバの文言をそのまま出す（設計書 §5）。
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setHireState({ kind: 'error', message });
    }
  }

  if (load.kind === 'loading') {
    return (
      <main>
        <h1>仲間</h1>
        <p>読み込み中…</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main>
        <h1>仲間</h1>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { me, tavern } = load;
  const partyFull = me.party.length >= 4;

  return (
    <main>
      <h1>仲間</h1>
      <p>所持金: {me.gold} ゴールド</p>

      <section>
        <h2>パーティ（{me.party.length} / 4）</h2>
        {me.party.map((member) => (
          <PartyMemberCard key={member.id} member={member} />
        ))}
      </section>

      <section>
        <h2>今日の酒場</h2>
        {partyFull && <p>パーティが満員です。仲間を雇うには枠を空ける必要があります。</p>}
        <ul>
          {tavern.recruits.map((recruit) => (
            <li key={recruit.id}>
              <RecruitCard
                recruit={recruit}
                onHire={() => void handleHire(recruit)}
                busy={hireState.kind === 'hiring'}
              />
            </li>
          ))}
        </ul>
        {hireState.kind === 'error' && <p role="alert">{hireState.message}</p>}
      </section>
    </main>
  );
}

function PartyMemberCard({ member }: { member: MePartyMember }) {
  return (
    <details>
      <summary>
        {member.name}（{jobName(member.jobId)} / 冒険Lv{member.adventureLevel} / ジョブLv{member.jobLevel}）
      </summary>
      <p>
        HP {member.stats.maxHp} / MP {member.stats.maxMp} / ATK {member.stats.atk} / DEF {member.stats.def} /
        {' '}MAT {member.stats.mat} / MDF {member.stats.mdf} / SPD {member.stats.spd}
      </p>
      <p>装備中の技: {member.equippedSkillIds.length === 0 ? 'なし' : member.equippedSkillIds.map(skillName).join('、')}</p>
      <p>習得済みの技: {member.learnedSkillIds.length === 0 ? 'なし' : member.learnedSkillIds.map(skillName).join('、')}</p>
    </details>
  );
}

/** 素質はA〜Eのまま出す。数字に直さない（設計書 §5 — エンジンがこの粒度で持っている）。 */
function RecruitCard({
  recruit,
  onHire,
  busy,
}: {
  recruit: Recruit;
  onHire: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <p>
        {recruit.name}（{jobName(recruit.jobId)} / 冒険Lv{recruit.adventureLevel} / {recruit.cost}ゴールド）
      </p>
      <p>
        素質: HP{recruit.aptitude.maxHp} MP{recruit.aptitude.maxMp} ATK{recruit.aptitude.atk} DEF{recruit.aptitude.def}{' '}
        MAT{recruit.aptitude.mat} MDF{recruit.aptitude.mdf} SPD{recruit.aptitude.spd}
      </p>
      <button type="button" onClick={onHire} disabled={busy}>
        雇う
      </button>
    </div>
  );
}
