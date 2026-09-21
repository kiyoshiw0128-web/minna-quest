import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { JOBS, PASSIVES, PETS, SKILLS } from '@mq/core';
import type {
  Aptitude, Job, LearnEntry, Pet, Recruit,
} from '@mq/core';
import {
  ApiError, UnauthorizedError, changeCharacterJob, dismissCharacter, fetchMe, fetchTavern,
  hireRecruit, registerEmail, reorderParty, setActivePet, suggestRecruit,
} from '../api.js';
import type { MeResult, MePartyMember, TavernResult } from '../api.js';

import { effectLabel, StatGrid, STAT_ORDER, STAT_SHORT } from './partyDisplay.js';

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
type RecruitAdviceState = { kind: 'idle' } | { kind: 'loading' }
  | { kind: 'done'; recruitId: string | null; source: 'jev' | 'fallback' }
  | { kind: 'error'; message: string };

/**
 * 転職・装備・並べ替え・解雇に共通の実行状態。key で「今どの操作が動いているか
 * ／どの操作が失敗したか」を区別する（characterId や 'party' など操作ごとに一意な文字列）。
 * 全部まとめて1つの状態にしているのは、この画面のどのボタンも「押したら
 * サーバに投げて、成功したら読み直す」という同じ形をしているため。
 */
type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; key: string }
  | { kind: 'error'; key: string; message: string };

function jobName(jobId: string): string {
  return JOBS[jobId as keyof typeof JOBS]?.name ?? jobId;
}

function skillName(skillId: string): string {
  return SKILLS[skillId as keyof typeof SKILLS]?.name ?? skillId;
}

/** ペットの効果欄。パッシブと同じ書式にする（設計書 §7）。 */
function petEffectLabel(pet: Pet): string {
  return effectLabel(pet.effect);
}

/** 覚える対象の名前。kind によって技マスタとパッシブマスタのどちらを引くか変わる。 */
function learnEntryName(entry: LearnEntry): string {
  return entry.kind === 'skill' ? skillName(entry.id) : (PASSIVES[entry.id as keyof typeof PASSIVES]?.name ?? entry.id);
}

/** 今の職業でまだ習得していない中で、最も近いレベルの習得予定。無ければ null（打ち止め）。 */
function nextLearnEntry(job: Job, currentLevel: number): LearnEntry | null {
  const upcoming = [...job.learnset].filter((entry) => entry.level > currentLevel).sort((a, b) => a.level - b.level);
  return upcoming[0] ?? null;
}

/** 「戦士Lv20・僧侶Lv15」のように解禁条件を1行にする（設計書 §6 の例文に合わせる）。 */
function requirementText(job: Job): string {
  return job.requires.map((requirement) => `${jobName(requirement.jobId)}Lv${requirement.level}`).join('・');
}

/** 酒場とパーティを1画面にまとめる（設計書 §3 — 別タブだと雇うたびに行き来することになる）。 */
export function PartyScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [hireState, setHireState] = useState<HireState>({ kind: 'idle' });
  const [actionState, setActionState] = useState<ActionState>({ kind: 'idle' });
  const [recruitAdvice, setRecruitAdvice] = useState<RecruitAdviceState>({ kind: 'idle' });

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

  /** 操作成功後はサーバから最新の編成を読み直す。 */
  async function runAction(key: string, fn: () => Promise<unknown>): Promise<void> {
    setActionState({ kind: 'busy', key });
    try {
      await fn();
      setActionState({ kind: 'idle' });
      await reload();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setActionState({ kind: 'error', key, message });
    }
  }

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

  async function handleRecruitAdvice(): Promise<void> {
    setRecruitAdvice({ kind: 'loading' });
    try {
      const result = await suggestRecruit(token);
      setRecruitAdvice({ kind: 'done', recruitId: result.recruitId, source: result.source });
    } catch (error) {
      if (error instanceof UnauthorizedError) return onUnauthorized();
      setRecruitAdvice({ kind: 'error', message: error instanceof ApiError ? error.message : '通信に失敗しました' });
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
  const busy = actionState.kind === 'busy';

  function errorFor(key: string): string | null {
    return actionState.kind === 'error' && actionState.key === key ? actionState.message : null;
  }

  async function handleMove(index: number, direction: -1 | 1): Promise<void> {
    const ids = me.party.map((member) => member.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const swapped = [...ids];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    await runAction('party', () => reorderParty(token, swapped));
  }

  return (
    <main>
      <h1>仲間</h1>
      <p>編成・転職・育成はここで。武器や技の付け替えは「装備・スキル」、購入は「店」へ。</p>
      <p>所持金: {me.gold} ゴールド</p>

      <RestoreKey token={token} />
      <EmailRecoverySetting
        token={token}
        registered={me.emailRegistered ?? false}
        onUpdated={() => void reload()}
      />

      <section>
        <h2>パーティ（{me.party.length} / 4）</h2>
        {errorFor('party') !== null && <p role="alert">{errorFor('party')}</p>}
        {me.party.map((member, index) => (
          <PartyMemberCard
            key={member.id}
            member={member}
            index={index}
            partySize={me.party.length}
            busy={busy}
            errorFor={errorFor}
            onMove={(direction) => void handleMove(index, direction)}
            onDismiss={() => void runAction(`dismiss:${member.id}`, () => dismissCharacter(token, member.id))}
            onChangeJob={(jobId) =>
              void runAction(`job:${member.id}`, () => changeCharacterJob(token, member.id, jobId))
            }
          />
        ))}
      </section>

      <PetSection
        pets={me.pets ?? []}
        activePetId={me.activePetId ?? null}
        busy={busy}
        error={errorFor('pet')}
        onSelect={(petId) => void runAction('pet', () => setActivePet(token, petId))}
      />

      <section>
        <h2>今日の酒場</h2>
        <p>Jevは現在のパーティと候補者の職業・素質・費用を比べて、足りない役割を補う仲間を選びます。</p>
        <button type="button" disabled={recruitAdvice.kind === 'loading' || tavern.recruits.length === 0}
          onClick={() => void handleRecruitAdvice()}>
          {recruitAdvice.kind === 'loading' ? 'Jevが選考中…' : 'Jevに仲間を選んでもらう'}
        </button>
        {recruitAdvice.kind === 'done' && <p role="status">{recruitAdvice.source === 'jev'
          ? 'Jevの推薦に印を付けました。能力を確認してから雇ってください。'
          : 'Jevに接続できなかったため、素質の総合値が高い候補に印を付けました。'}</p>}
        {recruitAdvice.kind === 'error' && <p role="alert">{recruitAdvice.message}</p>}
        {partyFull && <p>パーティが満員です。仲間を雇うには枠を空ける必要があります。</p>}
        <ul>
          {tavern.recruits.map((recruit) => (
            <li key={recruit.id}>
              <RecruitCard
                recruit={recruit}
                onHire={() => void handleHire(recruit)}
                busy={hireState.kind === 'hiring'}
                recommended={recruitAdvice.kind === 'done' && recruitAdvice.recruitId === recruit.id}
              />
            </li>
          ))}
        </ul>
        {hireState.kind === 'error' && <p role="alert">{hireState.message}</p>}
      </section>
    </main>
  );
}

function PartyMemberCard({
  member,
  index,
  partySize,
  busy,
  errorFor,
  onMove,
  onDismiss,
  onChangeJob,
}: {
  member: MePartyMember;
  index: number;
  partySize: number;
  busy: boolean;
  errorFor: (key: string) => string | null;
  onMove: (direction: -1 | 1) => void;
  onDismiss: () => void;
  onChangeJob: (jobId: string) => void;
}) {
  const dismissError = errorFor(`dismiss:${member.id}`);

  return (
    <details>
      <summary>
        {member.name}（{jobName(member.jobId)} / 冒険Lv{member.adventureLevel} / ジョブLv{member.jobLevel}）
      </summary>
      <StatGrid stats={member.stats} />

      <div>
        <button type="button" disabled={busy || index === 0} onClick={() => onMove(-1)}>
          ↑ 前へ
        </button>
        <button type="button" disabled={busy || index === partySize - 1} onClick={() => onMove(1)}>
          ↓ 後ろへ
        </button>
        {/*
          主人公は外せず解雇もできないので、そもそも押せないようにする。
          押せるボタンを出しておいてサーバに断られるのは、できない理由を
          先に伝えられるのに伝えていないだけになる。サーバ側のガードは
          そのまま残っており、ここは案内であって防御ではない。
        */}
        {member.isHero ? (
          <span>主人公は外せません</span>
        ) : (
          <button type="button" disabled={busy} onClick={onDismiss}>
            解雇する
          </button>
        )}
      </div>
      {dismissError !== null && <p role="alert">{dismissError}</p>}

      <JobPanel member={member} busy={busy} error={errorFor(`job:${member.id}`)} onChangeJob={onChangeJob} />
    </details>
  );
}

/** 転職パネル。就ける職業・就けない職業の両方を常に出す（設計書 §6）。 */
function JobPanel({
  member,
  busy,
  error,
  onChangeJob,
}: {
  member: MePartyMember;
  busy: boolean;
  error: string | null;
  onChangeJob: (jobId: string) => void;
}) {
  const currentJob = JOBS[member.jobId as keyof typeof JOBS] as Job | undefined;
  const nextEntry = currentJob === undefined ? null : nextLearnEntry(currentJob, member.jobLevel);

  return (
    <section>
      <h3>転職</h3>
      <p>
        {nextEntry === null
          ? 'この職業で覚える技はもう残っていません。'
          : `あと${nextEntry.level - member.jobLevel}レベルで「${learnEntryName(nextEntry)}」を習得します。`}
      </p>
      {/*
        就ける職業と、まだ就けない上級職を分ける。混ぜて並べると、
        押せる行と押せない行が交互に来て、どれを選べるのか一目で分からない。
        就けないものを消さないのは、目標として見えている必要があるため。
      */}
      <ul className="joblist">
        {Object.values(JOBS)
          .filter((job) => member.unlockedJobIds.includes(job.id))
          .map((job) => (
            <li key={job.id}>
              <JobOption job={job} member={member} busy={busy} onChangeJob={onChangeJob} />
            </li>
          ))}
      </ul>
      {Object.values(JOBS).some((job) => !member.unlockedJobIds.includes(job.id)) && (
        <>
          <h4>まだ就けない職業</h4>
          <ul className="joblist locked">
            {Object.values(JOBS)
              .filter((job) => !member.unlockedJobIds.includes(job.id))
              .map((job) => (
                <li key={job.id}>
                  <JobOption job={job} member={member} busy={busy} onChangeJob={onChangeJob} />
                </li>
              ))}
          </ul>
        </>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

function JobOption({
  job,
  member,
  busy,
  onChangeJob,
}: {
  job: Job;
  member: MePartyMember;
  busy: boolean;
  onChangeJob: (jobId: string) => void;
}) {
  const unlocked = member.unlockedJobIds.includes(job.id);
  const isCurrent = member.jobId === job.id;
  const visitedLevel = member.jobLevels[job.id];

  // 上級職の解禁条件は満たしていなくても常に表に出す。見えなければ、
  // 目標にできない（設計書 §6・§1）。
  if (!unlocked) {
    return (
      <>
        <span className="job-name">{job.name}</span>
        <span className="job-note">{requirementText(job)}が必要</span>
      </>
    );
  }

  return (
    <>
      <span className="job-name">{job.name}</span>
      <span className="job-note">
        {visitedLevel !== undefined ? `ジョブLv${visitedLevel}` : '未経験'}
      </span>
      {isCurrent ? (
        <span className="job-current">いまの職業</span>
      ) : (
        <button type="button" disabled={busy} onClick={() => onChangeJob(job.id)}>
          転職する
        </button>
      )}
    </>
  );
}

/**
 * 装備パネル。習得済みの技からアクティブ6・パッシブ2を選ぶ、この画面の核。
 *
 * アクティブもパッシブも、いま装備しているものを初期値に置く。ここを
 * 空から始めると、パッシブを触らずに更新しただけで装備が消える。
 */
/**
 * 素質。A〜Eのまま出す（数字に直さない。エンジンがこの粒度で持っている）。
 * 等級で色を変えるのは、7項目を読んで良し悪しを判断する場面だから。
 * 文字だけだと「MATがAで良い人材だ」に気づくのに時間がかかる。
 */
function AptitudeGrid({ aptitude }: { aptitude: Aptitude }) {
  return (
    <dl className="stat-grid aptitude">
      {STAT_ORDER.map((key) => (
        <div key={key} className="stat-cell">
          <dt>{STAT_SHORT[key]}</dt>
          <dd data-grade={aptitude[key]}>{aptitude[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * ペット欄（段階6・設計書 §7）。持っているペットの一覧と、いま連れている1匹を選ぶ。
 * 効果は @mq/core の PETS から解決する（学習済みパッシブと同じやり方。
 * サーバの /api/me はIDだけ返す）。
 */
function PetSection({
  pets,
  activePetId,
  busy,
  error,
  onSelect,
}: {
  pets: string[];
  activePetId: string | null;
  busy: boolean;
  error: string | null;
  onSelect: (petId: string) => void;
}) {
  return (
    <section>
      <h2>ペット</h2>
      {pets.length === 0 && <p>まだペットに出会っていません。</p>}
      {error !== null && <p role="alert">{error}</p>}
      <ul>
        {pets.map((petId) => {
          const pet = PETS[petId as keyof typeof PETS] as Pet | undefined;
          if (pet === undefined) return null;
          const isActive = activePetId === petId;
          return (
            <li key={petId}>
              <strong>{pet.name}</strong>
              {isActive && '　← 連れている'}
              <p>{pet.description}</p>
              <p>効果: {petEffectLabel(pet)}</p>
              {!isActive && (
                <button type="button" disabled={busy} onClick={() => onSelect(petId)}>
                  連れる
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 素質はA〜Eのまま出す。数字に直さない（設計書 §5 — エンジンがこの粒度で持っている）。 */
function RecruitCard({
  recruit,
  onHire,
  busy,
  recommended,
}: {
  recruit: Recruit;
  onHire: () => void;
  busy: boolean;
  recommended: boolean;
}) {
  return (
    <div>
      {recommended && <p className="ai-recommendation"><strong>◆ Jevの推薦</strong></p>}
      <p>
        {recruit.name}（{jobName(recruit.jobId)} / 冒険Lv{recruit.adventureLevel} / {recruit.cost}ゴールド）
      </p>
      <AptitudeGrid aptitude={recruit.aptitude} />
      <button type="button" onClick={onHire} disabled={busy}>
        雇う
      </button>
    </div>
  );
}

/**
 * 別の端末から戻るための合言葉。トークンそのものを見せている。
 *
 * 見せる判断について。これは実質パスワードなので、普通なら画面に出さない。
 * ただしこの遊びでは、参加の証がブラウザの保存領域にしか無く、招待コードは
 * 1人1枚の使い切りである。合言葉を出さないと、端末を変えるたびに招待コードが
 * 1枚消えていく。身内数人で遊ぶものなので、他人に渡らない前提を取り、
 * 「知られたら他人に成り代わられる」ことを本人に伝えたうえで見せる方を選んだ。
 */
function RestoreKey({ token }: { token: string }) {
  return (
    <details>
      <summary>別の端末から戻るための合言葉</summary>
      <p>
        この文字列を控えておくと、別の端末やブラウザから「合言葉で戻る」で
        同じ冒険に戻れます。招待コードは減りません。
      </p>
      <p>
        <strong>人に見せないでください。</strong>これを知っている人は、
        あなたとして遊べてしまいます。
      </p>
      <p><code>{token}</code></p>
    </details>
  );
}

type EmailSettingState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/**
 * メールアドレスの登録欄（設計書 §4・§6）。合言葉を無くしたときの
 * もう1つの戻り道。任意なので、登録しなくても遊びには一切影響しない
 * （設計書 §2.2 — 参加の条件にしない）。
 *
 * サーバは登録の有無だけを返し、アドレスそのものは返さない（設計書 §4）ため、
 * 「今のアドレス」を出す欄はここに存在しない。登録済みかどうかの表示と、
 * 登録し直す・削除するための入力だけを持つ。
 */
function EmailRecoverySetting({
  token, registered, onUpdated,
}: {
  token: string;
  registered: boolean;
  onUpdated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<EmailSettingState>({ kind: 'idle' });

  const saving = state.kind === 'saving';

  async function submit(value: string): Promise<void> {
    setState({ kind: 'saving' });
    try {
      await registerEmail(token, value);
      setEmail('');
      setState({ kind: 'idle' });
      onUpdated();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setState({ kind: 'error', message });
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (email.trim() === '' || saving) return;
    void submit(email.trim());
  }

  return (
    <details>
      <summary>合言葉をメールで受け取る（任意）</summary>
      <p>
        合言葉を無くしても、登録したメールアドレス宛に今の合言葉を再送できます。
        登録しなくても遊べます。
      </p>
      <p>{registered ? '登録済みです。' : 'まだ登録していません。'}</p>
      <form onSubmit={handleSubmit}>
        <label>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={saving}
          />
        </label>
        <button type="submit" disabled={saving || email.trim() === ''}>
          {registered ? '登録し直す' : '登録する'}
        </button>
      </form>
      {registered && (
        <button type="button" onClick={() => void submit('')} disabled={saving}>
          登録を削除する
        </button>
      )}
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
    </details>
  );
}
