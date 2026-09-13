import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, UnauthorizedError, buyItem, fetchMe, fetchShop } from '../api.js';
import type { MeResult, ShopResult } from '../api.js';
import { ShopSection } from './equipmentPanels.js';

type Props = { token: string; onUnauthorized: () => void; onOpenEquipment?: () => void };

export function ShopScreen({ token, onUnauthorized, onOpenEquipment }: Props) {
  const [data, setData] = useState<{ me: MeResult; shop: ShopResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const buying = useRef(false);
  const reload = useCallback(async () => {
    setError(null);
    try {
      const [me, shop] = await Promise.all([fetchMe(token), fetchShop(token)]);
      setData({ me, shop });
    } catch (cause) {
      if (cause instanceof UnauthorizedError) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '通信に失敗しました');
    }
  }, [token, onUnauthorized]);
  useEffect(() => { void reload(); }, [reload]);

  async function buy(itemId: string) {
    if (buying.current || !data) return;
    buying.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await buyItem(token, itemId);
      const me = await fetchMe(token);
      setData({ ...data, me });
      setMessage(`${data.shop.items.find((item) => item.id === itemId)?.name ?? '装備'}を購入しました。「装備・スキル」で仲間に装備できます。`);
    } catch (cause) {
      if (cause instanceof UnauthorizedError) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '通信に失敗しました。所持品を再確認してください。');
    } finally {
      buying.current = false;
      setBusy(false);
    }
  }
  return <main>
    <h1>店</h1>
    <p>武器・防具を購入できます。買った装備は「装備・スキル」で付け替えます。</p>
    {onOpenEquipment && <button type="button" disabled={busy} onClick={onOpenEquipment}>装備・スキルを設定する</button>}
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => void reload()}>再読込</button></p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p>読み込み中…</p>}
    {data && <>
      <p>所持金: {data.me.gold} ゴールド</p>
      <ShopSection shopItems={data.shop.items} gold={data.me.gold} busy={busy} error={null} onBuy={(id) => void buy(id)} />
    </>}
  </main>;
}
