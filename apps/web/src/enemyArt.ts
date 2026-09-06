/**
 * 敵の絵。
 *
 * **絵が無い敵のほうが多い。** 雑魚8体と闘技場20体には用意していないので、
 * 「無いのが普通」として作る。壊れた画像の記号を出さない。
 *
 * 対応表を画面側に置いてサーバとマスタに持たせないのは、絵があくまで見た目で
 * あるため。`packages/core` の敵の定義に画像のパスが混ざると、戦闘の計算に
 * 関係のないものが核のデータに入り込む。
 */
const ART: Readonly<Record<string, string>> = {
  balgos: '/bosses/balgos.png',
  gouza: '/bosses/gouza.png',
  vornil: '/bosses/vornil.png',
  arenaAbyssalSovereign: '/bosses/abyssalSovereign.png',
};

/** その敵の絵のパス。無ければ null。 */
export function enemyArtPath(enemyId: string): string | null {
  return ART[enemyId] ?? null;
}
