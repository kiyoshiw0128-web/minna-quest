import { useCallback, useEffect, useRef, useState } from 'react';
import { ARMORS, WEAPONS } from '@mq/core';
import { ApiError, UnauthorizedError, fetchMe, updateCharacterEquipmentItems, updateEquipment } from '../api.js';
import type { MeResult } from '../api.js';
import { EquipPanel, EquipmentItemPanel } from './equipmentPanels.js';

type Props = { token: string; onUnauthorized: () => void; onOpenShop?: () => void };

export function EquipmentScreen({ token, onUnauthorized, onOpenShop }: Props) {
  const [me, setMe] = useState<MeResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setMe(await fetchMe(token));
    } catch (cause) {
      if (cause instanceof UnauthorizedError) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '通信に失敗しました');
    }
  }, [token, onUnauthorized]);
  useEffect(() => { void reload(); }, [reload]);

  async function save(action: () => Promise<unknown>, label: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage('');
    setError(null);
    try {
      await action();
      setMe(await fetchMe(token));
      setMessage(`${label}を保存しました。`);
    } catch (cause) {
      if (cause instanceof UnauthorizedError) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '通信に失敗しました。状態を再確認してください。');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const member = me?.party.find((item) => item.id === selectedId) ?? me?.party[0];
  const weapon = member?.equippedWeaponId ? WEAPONS[member.equippedWeaponId as keyof typeof WEAPONS]?.name : null;
  const armor = member?.equippedArmorId ? ARMORS[member.equippedArmorId as keyof typeof ARMORS]?.name : null;
  return (
    <main>
      <h1>装備・スキル</h1>
      <p>仲間を選び、持っている武器・防具と習得した技をセットします。選んだら、それぞれの保存ボタンを押してください。</p>
      {onOpenShop && <button type="button" disabled={busy} onClick={onOpenShop}>武器・防具を買いに行く</button>}
      {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => void reload()}>再読込</button></p>}
      {message && <p role="status">{message}</p>}
      {!me && !error && <p>読み込み中…</p>}
      {me && !member && <p>装備を設定する仲間がいません。</p>}
      {me && member && <>
        <label className="equipment-character">設定する仲間
          <select value={member.id} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setMessage(''); setError(null); }}>
            {me.party.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <h2>{member.name}</h2>
        <p>装備中：武器「{weapon ?? 'なし'}」／防具「{armor ?? 'なし'}」</p>
        <EquipmentItemPanel key={`items:${member.id}:${member.equippedWeaponId}:${member.equippedArmorId}`} member={member} party={me.party} items={me.items ?? []}
          busy={busy} error={null} onSave={(weaponId, armorId) => void save(
            () => updateCharacterEquipmentItems(token, member.id, weaponId, armorId), '武器・防具')} />
        <EquipPanel key={`skills:${member.id}:${JSON.stringify([member.equippedSkillIds, member.equippedPassiveIds])}`} member={member} busy={busy} error={null}
          onSave={(activeIds, passiveIds) => void save(
            () => updateEquipment(token, member.id, activeIds, passiveIds), 'スキル')} />
      </>}
    </main>
  );
}
