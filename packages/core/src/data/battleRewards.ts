/** 戦闘に勝ったときの報酬。敵1体につき1エントリ。 */
export type BattleReward = { readonly gold: number; readonly exp: number };

/**
 * 敵ごとの戦闘報酬表。数値をサーバのコードに埋め込まず、ここに集約する
 * （段階3c設計書 §6.4）。
 *
 * exp は gainExp の adventure と job の両方に同じ値をそのまま渡す前提。
 * jobExpToNext が adventureExpToNext のちょうど半分の傾き（progression/curve.ts）
 * で設計されているのは、「同じ経験値を渡すとジョブの方が早く上がる」ことで
 * 転職を試す敷居を下げるためなので、ここで adventure と job に別々の値を
 * 割り振る意味が無い。同じ数を1つ持てば足りる。
 *
 * balgos（第1章のボス。序盤の雑魚戦の敵IDとしても流用されている。
 * data/enemies.ts 参照）:
 *
 * - exp 100: adventureExpToNext(1) は 60。1勝すれば確実に冒険レベルが
 *   1つ上がり、余り40が次に持ち越される。レベルが上がるほど必要経験値が
 *   二乗で増える（60*L^2）ので、序盤の「勝てば伸びる」実感と、
 *   レベルが進んだ後の「何度も勝たないと伸びない」長期目標への移行が
 *   この1つの数値だけで両立する。ジョブ側は必要経験値がその半分
 *   （30*L^2）なので、同じ100でも序盤は複数ジョブレベル分を賄える。
 *
 * - gold 150: 酒場の雇用コストは recruitCost = 80 * 冒険Lv * (1 + 素質点/28)
 *   （daily/recruit.ts）。冒険Lv3・平均的な素質（素質点14/28）なら
 *   80*3*1.5=360。戦闘はデイリー制で、その日の3択に選ばれてかつ選択肢として
 *   通らなければ挑めないので毎日は当たらない。150ゴールドなら3勝
 *   （体感で数日〜1週間程度）で「そこそこの人材」を1人雇えるのを目安にした。
 *   即日で雇えるほど安くはせず、心が折れるほど遠くもしない値。
 */
/**
 * 雑魚敵8体分。exp は adventureExpToNext(その敵の想定冒険Lv) に対する割合で
 * そろえた（banditScoutが約25%、以降レベルが上がるほど約7〜9%に収束する）。
 * 二乗カーブなので同じ割合では絶対値がすぐ跳ね上がる。「弱い敵は少なく、
 * 強い敵は多く」を数値の比率ではなく「そのレベルで何度勝てば伸びるか」で
 * そろえている。gold は recruitCost(その冒険Lv, 素質14/28) の1割強を目安にした
 * （balgosの150/recruitCost(3)=360が約42%なのに対しこちらは11〜14%と低めなのは、
 * balgosが章ボスとして特別重い報酬を持つ一方、雑魚は何度も倒す前提だから）。
 */
export const BATTLE_REWARDS: Readonly<Record<string, BattleReward>> = {
  balgos: { gold: 200, exp: 400 },
  // adventureExpToNext(1)=60。15/60=25%。何度も出会う一番弱い雑魚なので低め。
  banditScout: { gold: 20, exp: 15 },
  // adventureExpToNext(3)=540。60/540=11%。recruitCost(3)=360。45/360=12.5%。
  forestWolf: { gold: 45, exp: 60 },
  // adventureExpToNext(5)=1500。140/1500=9.3%。recruitCost(5)=600。70/600=11.7%。
  goblinRaider: { gold: 70, exp: 140 },
  // adventureExpToNext(8)=3840。320/3840=8.3%。recruitCost(8)=960。110/960=11.5%。
  ogreBrute: { gold: 110, exp: 320 },
  // adventureExpToNext(12)=8640。650/8640=7.5%。recruitCost(12)=1440。170/1440=11.8%。
  armoredKnight: { gold: 170, exp: 650 },
  // adventureExpToNext(18)=19440。1400/19440=7.2%。recruitCost(18)=2160。260/2160=12%。
  direWyvern: { gold: 260, exp: 1400 },
  // adventureExpToNext(21)=26460。1900/26460=7.2%。recruitCost(21)=2520。320/2520=12.7%。
  stoneGolem: { gold: 320, exp: 1900 },
  // adventureExpToNext(23)=31740。2300/31740=7.2%。recruitCost(23)=2760。380/2760=13.8%。
  // 第2章の最強雑魚なのでバルゴスに次ぐ額にした。
  voidWraith: { gold: 380, exp: 2300 },
};
