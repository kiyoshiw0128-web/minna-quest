import { useCallback, useEffect, useState } from 'react';
import { ARMORS, JOBS, PASSIVES, PETS, SKILLS, WEAPONS, applyEquipment } from '@mq/core';
import type {
  DamageSpec, Effect, Element, Equipment, Job, LearnEntry, Passive, Pet, Recruit, Skill, StatBlock,
} from '@mq/core';
import {
  ApiError, UnauthorizedError, buyItem, changeCharacterJob, dismissCharacter, fetchMe, fetchShop, fetchTavern,
  hireRecruit, reorderParty, setActivePet, updateCharacterEquipmentItems, updateEquipment,
} from '../api.js';
import type { MeResult, MePartyMember, ShopResult, TavernResult } from '../api.js';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; me: MeResult; tavern: TavernResult; shop: ShopResult };

/** 雇用は同時に1件まで。複数のボタンを連打されても二重に送らせない。 */
type HireState = { kind: 'idle' } | { kind: 'hiring'; recruitId: string } | { kind: 'error'; message: string };

/** 装備の購入も雇用と同じく同時に1件まで。 */
type BuyState = { kind: 'idle' } | { kind: 'buying'; itemId: string } | { kind: 'error'; message: string };

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

const ELEMENT_LABEL: Record<Element, string> = {
  none: 'なし', fire: '火', ice: '氷', thunder: '雷', holy: '光', dark: '闇',
};

/**
 * 技の「威力」欄。BattleScreen.tsx の damageLabel と同じ内容だが、
 * どちらもファイル内で完結する短い関数なので、共有ヘルパーに切り出すほどの
 * 重複ではないと判断してそのまま複製している（apps/worker/src/routes/me.ts の
 * jobOf に同じ考え方のコメントがある）。
 */
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

const STAT_LABEL: Record<string, string> = { atk: 'ATK', def: 'DEF', mat: 'MAT', mdf: 'MDF', spd: 'SPD' };

/** 装備の効果欄用。パッシブ・ペットと違いStatBlockの全項目（maxHp等）を持ちうる。 */
const EQUIP_STAT_LABEL: Record<keyof StatBlock, string> = {
  maxHp: 'HP', maxMp: 'MP', atk: 'ATK', def: 'DEF', mat: 'MAT', mdf: 'MDF', spd: 'SPD',
};

/** 装備1つの効果を数字で出す（設計書 §7「効果を数字で出す」）。加算のみなので符号は常に+。 */
function equipmentModsLabel(item: Equipment): string {
  return (Object.entries(item.mods) as Array<[keyof StatBlock, number]>)
    .map(([key, value]) => `${EQUIP_STAT_LABEL[key]} +${value}`)
    .join('・');
}

/** そのプレイヤーが持つ装備IDごとの所持数。同じIDを複数買えるので集計が要る（設計書 §6）。 */
function ownedItemCounts(itemIds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of itemIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/**
 * 指定したキャラを除く、パーティ内の他キャラが今つけている装備の個数。
 * 所持数からこれを引いた分だけ「まだ付け替えに回せる」（設計書 §8 テスト5）。
 */
function equippedElsewhereCounts(party: readonly MePartyMember[], excludeCharacterId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const member of party) {
    if (member.id === excludeCharacterId) continue;
    if (member.equippedWeaponId != null) counts[member.equippedWeaponId] = (counts[member.equippedWeaponId] ?? 0) + 1;
    if (member.equippedArmorId != null) counts[member.equippedArmorId] = (counts[member.equippedArmorId] ?? 0) + 1;
  }
  return counts;
}

/**
 * 効果を数字で出す（設計書 §7「効果を数字で出す。曖昧にしない」）。
 * パッシブとペットは同じ Effect 型で表されている（設計書 §2）ので、
 * ラベル化のロジックも1つで足りる。
 */
function effectLabel(effect: Effect): string {
  if (effect.kind === 'statMod') return `${STAT_LABEL[effect.stat] ?? effect.stat} +${Math.round(effect.rate * 100)}%`;
  if (effect.kind === 'damageTaken') return `被ダメージ ${Math.round(effect.rate * 100)}%`;
  return `${effect.turns}ターン行動不能`;
}

/** パッシブは常時効果なので、MP・クールダウンの代わりに効果そのものを短く出す。 */
function passiveEffectLabel(passive: Passive): string {
  return effectLabel(passive.effect);
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
  const [buyState, setBuyState] = useState<BuyState>({ kind: 'idle' });
  const [actionState, setActionState] = useState<ActionState>({ kind: 'idle' });

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const [me, tavern, shop] = await Promise.all([fetchMe(token), fetchTavern(token), fetchShop(token)]);
      setLoad({ kind: 'loaded', me, tavern, shop });
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

  /**
   * 転職・装備・並べ替え・解雇の共通の実行経路。成功したら読み直す（設計書の
   * どの操作も「サーバの判定結果がそのまま最新の状態」なので、楽観的更新は
   * せずサーバに聞き直す方が安全）。読み直し中に画面全体が「読み込み中」に
   * 戻ることはない（reload はここから呼ばずactionState経由のときだけ
   * loaded のまま留める）ため、選択途中の他の入力を壊さない。
   */
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

  async function handleBuy(itemId: string): Promise<void> {
    setBuyState({ kind: 'buying', itemId });
    try {
      await buyItem(token, itemId);
      setBuyState({ kind: 'idle' });
      await reload();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      // 金貨不足はサーバの文言をそのまま出す（設計書 §6）。
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setBuyState({ kind: 'error', message });
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

  const { me, tavern, shop } = load;
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
      <p>所持金: {me.gold} ゴールド</p>

      <RestoreKey token={token} />

      <section>
        <h2>パーティ（{me.party.length} / 4）</h2>
        {errorFor('party') !== null && <p role="alert">{errorFor('party')}</p>}
        {me.party.map((member, index) => (
          <PartyMemberCard
            key={member.id}
            member={member}
            party={me.party}
            items={me.items ?? []}
            index={index}
            partySize={me.party.length}
            busy={busy}
            errorFor={errorFor}
            onMove={(direction) => void handleMove(index, direction)}
            onDismiss={() => void runAction(`dismiss:${member.id}`, () => dismissCharacter(token, member.id))}
            onChangeJob={(jobId) =>
              void runAction(`job:${member.id}`, () => changeCharacterJob(token, member.id, jobId))
            }
            onUpdateEquipment={(activeIds, passiveIds) =>
              void runAction(`equip:${member.id}`, () => updateEquipment(token, member.id, activeIds, passiveIds))
            }
            onUpdateEquipmentItems={(weaponId, armorId) =>
              void runAction(`equip-item:${member.id}`, () =>
                updateCharacterEquipmentItems(token, member.id, weaponId, armorId))
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

      <ShopSection
        shopItems={shop.items}
        gold={me.gold}
        busy={buyState.kind === 'buying'}
        error={buyState.kind === 'error' ? buyState.message : null}
        onBuy={(itemId) => void handleBuy(itemId)}
      />

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

function PartyMemberCard({
  member,
  party,
  items,
  index,
  partySize,
  busy,
  errorFor,
  onMove,
  onDismiss,
  onChangeJob,
  onUpdateEquipment,
  onUpdateEquipmentItems,
}: {
  member: MePartyMember;
  party: readonly MePartyMember[];
  items: readonly string[];
  index: number;
  partySize: number;
  busy: boolean;
  errorFor: (key: string) => string | null;
  onMove: (direction: -1 | 1) => void;
  onDismiss: () => void;
  onChangeJob: (jobId: string) => void;
  onUpdateEquipment: (activeIds: string[], passiveIds: string[]) => void;
  onUpdateEquipmentItems: (weaponId: string | null, armorId: string | null) => void;
}) {
  const dismissError = errorFor(`dismiss:${member.id}`);

  return (
    <details>
      <summary>
        {member.name}（{jobName(member.jobId)} / 冒険Lv{member.adventureLevel} / ジョブLv{member.jobLevel}）
      </summary>
      <p>
        HP {member.stats.maxHp} / MP {member.stats.maxMp} / ATK {member.stats.atk} / DEF {member.stats.def} /
        {' '}MAT {member.stats.mat} / MDF {member.stats.mdf} / SPD {member.stats.spd}
      </p>

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
      <EquipPanel member={member} busy={busy} error={errorFor(`equip:${member.id}`)} onSave={onUpdateEquipment} />
      <EquipmentItemPanel
        member={member}
        party={party}
        items={items}
        busy={busy}
        error={errorFor(`equip-item:${member.id}`)}
        onSave={onUpdateEquipmentItems}
      />
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
      <ul>
        {Object.values(JOBS).map((job) => (
          <li key={job.id}>
            <JobOption job={job} member={member} busy={busy} onChangeJob={onChangeJob} />
          </li>
        ))}
      </ul>
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
    return <span>{job.name} — {requirementText(job)}が必要</span>;
  }

  return (
    <span>
      {job.name}
      {visitedLevel !== undefined ? `（ジョブLv${visitedLevel}）` : '（未経験）'}
      {isCurrent ? (
        '　← 現在の職業'
      ) : (
        <button type="button" disabled={busy} onClick={() => onChangeJob(job.id)}>
          転職する
        </button>
      )}
    </span>
  );
}

/**
 * 装備パネル。習得済みの技からアクティブ6・パッシブ2を選ぶ、この画面の核。
 *
 * アクティブもパッシブも、いま装備しているものを初期値に置く。ここを
 * 空から始めると、パッシブを触らずに更新しただけで装備が消える。
 */
function EquipPanel({
  member,
  busy,
  error,
  onSave,
}: {
  member: MePartyMember;
  busy: boolean;
  error: string | null;
  onSave: (activeIds: string[], passiveIds: string[]) => void;
}) {
  const [activeIds, setActiveIds] = useState<string[]>(member.equippedSkillIds);
  const [passiveIds, setPassiveIds] = useState<string[]>(member.equippedPassiveIds);
  const learnedPassiveIds = member.learnedPassiveIds;

  function toggle(ids: string[], setIds: (ids: string[]) => void, id: string, max: number): void {
    if (ids.includes(id)) {
      setIds(ids.filter((existing) => existing !== id));
      return;
    }
    if (ids.length >= max) return; // 上限に達した枠はチェックボックスをdisabledにして防ぐ。
    setIds([...ids, id]);
  }

  return (
    <section>
      <h3>装備（アクティブ {activeIds.length} / 6・パッシブ {passiveIds.length} / 2）</h3>

      <h4>アクティブ技</h4>
      {member.learnedSkillIds.length === 0 && <p>まだ技を習得していません。</p>}
      <table>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">技</th>
            <th scope="col">MP</th>
            <th scope="col">クールダウン</th>
            <th scope="col">威力</th>
            <th scope="col">属性</th>
          </tr>
        </thead>
        <tbody>
          {member.learnedSkillIds.map((skillId) => {
            const skill = SKILLS[skillId as keyof typeof SKILLS] as Skill | undefined;
            if (skill === undefined) return null;
            const checked = activeIds.includes(skillId);
            return (
              <tr key={skillId}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${skill.name}をアクティブに装備`}
                    checked={checked}
                    disabled={busy || (!checked && activeIds.length >= 6)}
                    onChange={() => toggle(activeIds, setActiveIds, skillId, 6)}
                  />
                </td>
                <td>
                  {skill.name}
                  {/* 装備を選ぶ画面でも、ペットが要ることは見えていないと選べない。 */}
                  {skill.requiresPet === true && '（要ペット）'}
                </td>
                <td>{skill.mpCost}</td>
                <td>{skill.cooldown === 0 ? '無し' : `${skill.cooldown}ターン`}</td>
                <td>{damageLabel(skill.damage)}</td>
                <td>{ELEMENT_LABEL[skill.element]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4>パッシブ</h4>
      {learnedPassiveIds.length === 0 && <p>まだパッシブを習得していません。</p>}
      <table>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">パッシブ</th>
            <th scope="col">効果</th>
          </tr>
        </thead>
        <tbody>
          {learnedPassiveIds.map((passiveId) => {
            const passive = PASSIVES[passiveId as keyof typeof PASSIVES];
            if (passive === undefined) return null;
            const checked = passiveIds.includes(passiveId);
            return (
              <tr key={passiveId}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${passive.name}をパッシブに装備`}
                    checked={checked}
                    disabled={busy || (!checked && passiveIds.length >= 2)}
                    onChange={() => toggle(passiveIds, setPassiveIds, passiveId, 2)}
                  />
                </td>
                <td>{passive.name}</td>
                <td>{passiveEffectLabel(passive)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button type="button" disabled={busy} onClick={() => onSave(activeIds, passiveIds)}>
        装備を更新する
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

/**
 * 武器・防具の装備パネル（段階8・設計書 §7）。
 *
 * 「なし」を含む選択式（ラジオボタン）にしてあるのは、武器1・防具1の枠しか
 * 無く、アクティブ技のような複数選択の余地が無いため。選ぶたびに、
 * その組み合わせで実際どれだけ能力が上がるかを数字で出す
 * （設計書 §7「能力がいくつ上がるかを数字で出す」）。
 *
 * 「あと何個装備に回せるか」はサーバから来る所持数（items）と、パーティ内の
 * 他キャラの装備状況（party）から画面側で数える。所持数を超えて複数人に
 * 付けようとする選択肢はここで disabled にする（実際の可否はサーバのSQLが
 * 最終的に守るので、これは案内であって防御ではない。設計書 §8 テスト5）。
 */
function EquipmentItemPanel({
  member,
  party,
  items,
  busy,
  error,
  onSave,
}: {
  member: MePartyMember;
  party: readonly MePartyMember[];
  items: readonly string[];
  busy: boolean;
  error: string | null;
  onSave: (weaponId: string | null, armorId: string | null) => void;
}) {
  const [weaponId, setWeaponId] = useState<string | null>(member.equippedWeaponId ?? null);
  const [armorId, setArmorId] = useState<string | null>(member.equippedArmorId ?? null);

  const owned = ownedItemCounts(items);
  const elsewhere = equippedElsewhereCounts(party, member.id);

  function availableCount(itemId: string): number {
    return (owned[itemId] ?? 0) - (elsewhere[itemId] ?? 0);
  }

  const ownedWeaponIds = Object.keys(WEAPONS).filter((id) => (owned[id] ?? 0) > 0);
  const ownedArmorIds = Object.keys(ARMORS).filter((id) => (owned[id] ?? 0) > 0);

  // 装備前の実効ステータスを基準に、選んでいる組み合わせでの見込み値を出す。
  // baseStats はサーバ（段階8で足した項目）が返す。古い応答（テストのモック等）
  // には無いことがあるので、その場合は現在のstats（装備込み）で代用する。
  const base = member.baseStats ?? member.stats;
  const previewWeapon = weaponId === null ? null : WEAPONS[weaponId as keyof typeof WEAPONS] ?? null;
  const previewArmor = armorId === null ? null : ARMORS[armorId as keyof typeof ARMORS] ?? null;
  const preview = applyEquipment(base, previewWeapon, previewArmor);

  function equipmentOption(
    id: string | null,
    name: string,
    modsLabel: string,
    groupName: string,
    current: string | null,
    selected: string | null,
    onSelect: (id: string | null) => void,
  ) {
    const isCurrent = id !== null && current === id;
    const canSelect = id === null || isCurrent || availableCount(id) > 0;
    return (
      <li key={id ?? 'none'}>
        <label>
          <input
            type="radio"
            name={groupName}
            checked={selected === id}
            disabled={busy || !canSelect}
            onChange={() => onSelect(id)}
          />
          {name}
          {modsLabel !== '' && `（${modsLabel}）`}
          {id !== null && !canSelect && '　他のキャラが装備中で所持数が足りません'}
        </label>
      </li>
    );
  }

  return (
    <section>
      <h3>装備</h3>
      <p>
        HP {preview.maxHp} / MP {preview.maxMp} / ATK {preview.atk} / DEF {preview.def} /
        {' '}MAT {preview.mat} / MDF {preview.mdf} / SPD {preview.spd}
      </p>

      <h4>武器</h4>
      {ownedWeaponIds.length === 0 && <p>まだ武器を持っていません。店で買えます。</p>}
      <ul>
        {equipmentOption(null, 'なし', '', `weapon-${member.id}`, member.equippedWeaponId ?? null, weaponId, setWeaponId)}
        {ownedWeaponIds.map((id) => {
          const item = WEAPONS[id as keyof typeof WEAPONS];
          return equipmentOption(
            id, item.name, equipmentModsLabel(item), `weapon-${member.id}`,
            member.equippedWeaponId ?? null, weaponId, setWeaponId,
          );
        })}
      </ul>

      <h4>防具</h4>
      {ownedArmorIds.length === 0 && <p>まだ防具を持っていません。店で買えます。</p>}
      <ul>
        {equipmentOption(null, 'なし', '', `armor-${member.id}`, member.equippedArmorId ?? null, armorId, setArmorId)}
        {ownedArmorIds.map((id) => {
          const item = ARMORS[id as keyof typeof ARMORS];
          return equipmentOption(
            id, item.name, equipmentModsLabel(item), `armor-${member.id}`,
            member.equippedArmorId ?? null, armorId, setArmorId,
          );
        })}
      </ul>

      <button type="button" disabled={busy} onClick={() => onSave(weaponId, armorId)}>
        装備を更新する
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

/**
 * 店（段階8・設計書 §6・§7）。値段と効果を出し、買えない場合は理由
 * （金貨不足）をそのまま出す。品揃えは全員共通・日替わりにしない
 * （worker/src/routes/shop.ts）。
 */
function ShopSection({
  shopItems,
  gold,
  busy,
  error,
  onBuy,
}: {
  shopItems: readonly Equipment[];
  gold: number;
  busy: boolean;
  error: string | null;
  onBuy: (itemId: string) => void;
}) {
  return (
    <section>
      <h2>店</h2>
      {error !== null && <p role="alert">{error}</p>}
      <ul>
        {shopItems.map((item) => {
          const affordable = gold >= item.cost;
          return (
            <li key={item.id}>
              {item.name}（{item.slot === 'weapon' ? '武器' : '防具'} / {equipmentModsLabel(item)} /{' '}
              {item.cost}ゴールド）
              <button type="button" disabled={busy || !affordable} onClick={() => onBuy(item.id)}>
                買う
              </button>
              {!affordable && <span>　金貨が足りません</span>}
            </li>
          );
        })}
      </ul>
    </section>
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
