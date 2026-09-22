import { useState } from 'react';
import { ARMORS, PASSIVES, SKILLS, WEAPONS, applyEquipment } from '@mq/core';
import type { DamageSpec, Element, Equipment, StatBlock, Skill } from '@mq/core';
import type { MePartyMember } from '../api.js';
import { effectLabel, StatGrid } from './partyDisplay.js';
import { EquipmentArt } from '../EquipmentArt.js';

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

export function EquipPanel({
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
      <h3>スキル（アクティブ {activeIds.length} / 6・パッシブ {passiveIds.length} / 2）</h3>

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
                <td>{effectLabel(passive.effect)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button type="button" disabled={busy} onClick={() => onSave(activeIds, passiveIds)}>
        スキルを保存
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
export function EquipmentItemPanel({
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
      <li key={id ?? 'none'} className="equipment-option">
        <label>
          <input
            type="radio"
            name={groupName}
            checked={selected === id}
            disabled={busy || !canSelect}
            onChange={() => onSelect(id)}
          />
          {id !== null && <EquipmentArt itemId={id} slot={groupName.startsWith('weapon-') ? 'weapon' : 'armor'} />}
          <span><strong>{name}</strong>{modsLabel !== '' && <small>{modsLabel}</small>}
          {id !== null && !canSelect && <small>ほかの仲間が装備中</small>}</span>
        </label>
      </li>
    );
  }

  return (
    <section>
      <h3>武器・防具</h3>
      {/* 装備を選び直した結果を、いまの値との差付きで出す。差が見えないと
          「この剣に替えると何がどれだけ上がるのか」を暗算することになる。 */}
      <StatGrid stats={preview} diff={member.stats} />

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
        武器・防具を保存
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}

export function ShopSection({
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
  /**
   * 武器と防具に分け、それぞれ値段順に並べる。
   *
   * 20品を1列に流していたため、武器と防具が混ざり、しかも買えない品ごとに
   * 「金貨が足りません」が並んで20回出ていた。同じ文が20回出るのは、
   * 1回も読まれないのと同じである。買えるかどうかは押せるかどうかで示し、
   * 足りない額だけを添える。
   */
  const groups: { label: string; items: Equipment[] }[] = [
    { label: '武器', items: shopItems.filter((i) => i.slot === 'weapon') },
    { label: '防具', items: shopItems.filter((i) => i.slot === 'armor') },
  ];

  return (
    <section>
      <h2>品ぞろえ</h2>
      {error !== null && <p role="alert">{error}</p>}
      {groups.map((group) => (
        <div key={group.label}>
          <h3>{group.label}</h3>
          <ul className="shelf">
            {[...group.items].sort((a, b) => a.cost - b.cost).map((item) => {
              const affordable = gold >= item.cost;
              return (
                <li key={item.id} className="shelf-item" data-affordable={affordable}>
                  <EquipmentArt itemId={item.id} slot={item.slot} />
                  <span className="shelf-name"><strong>{item.name}</strong></span>
                  <span className="shelf-mods">{equipmentModsLabel(item)}</span>
                  <span className="shelf-cost">
                    {item.cost}G
                    {!affordable && <small>あと{item.cost - gold}</small>}
                  </span>
                  <button type="button" disabled={busy || !affordable} onClick={() => onBuy(item.id)}>
                    買う
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
