import type { Effect } from '../battle/effects.js';

/**
 * ペット1匹の定義。
 *
 * 効果はパッシブと同じ `Effect` 型で表す（設計書 §2 —「パッシブと同じ Effect 型で
 * 表す。新しい仕組みを足さない」）。turns は永続を表す Infinity で、
 * passives.ts と同じ約束に揃えてある。
 */
export type Pet = { id: string; name: string; description: string; effect: Effect };

/**
 * ペットのマスタ。8匹。
 *
 * 効果は控えめ（±10〜15%程度）にしてある。パッシブ2枠と足し合わさるため、
 * ここに強い効果を置くとペットを持っているかどうかで難易度が割れてしまう
 * （設計書 §3）。戦闘は乱数を一切使わず、雑魚8体・章ボス・闘技場20階の
 * すべてを `simulate` の実測で調整してあるので、ペットの効果は
 * その前提を壊さない大きさにとどめる。
 *
 * id は data/events.ts の outcome.petId から参照される。ここのキーと
 * outcome.petId の文字列は一致していなければならない
 * （tests/daily/eventsData.test.ts が健全性を見る）。
 */
export const PETS = {
  puppy: {
    id: 'puppy',
    name: '迷子の子犬モモ',
    description: '旅の途中で拾った子犬。忠実に主人を守ろうとする。',
    effect: { kind: 'statMod', stat: 'atk', rate: 0.15, turns: Infinity },
  },
  kitten: {
    id: 'kitten',
    name: '路地裏の子猫ラン',
    description: '身軽な猫。ひらりと動いて、仲間の足取りを軽くしてくれる。',
    effect: { kind: 'statMod', stat: 'spd', rate: 0.1, turns: Infinity },
  },
  foxKit: {
    id: 'foxKit',
    name: '森の子狐コン',
    description: '警戒心が強い子狐。そばにいるだけで仲間の守りが固くなる。',
    effect: { kind: 'statMod', stat: 'def', rate: 0.1, turns: Infinity },
  },
  owlChick: {
    id: 'owlChick',
    name: '物知りふくろうホウ',
    description: '夜目が利く小さなふくろう。魔力の使い方をそっと教えてくれる。',
    effect: { kind: 'statMod', stat: 'mat', rate: 0.1, turns: Infinity },
  },
  travelSlime: {
    id: 'travelSlime',
    name: '道連れスライム',
    description: 'ぷるぷると揺れながらついてくる。衝撃を体で吸ってくれる。',
    effect: { kind: 'damageTaken', rate: -0.1, turns: Infinity },
  },
  ferret: {
    id: 'ferret',
    name: '旅慣れたフェレット',
    description: 'すばしっこい相棒。危険をいち早く察知して仲間の心を守る。',
    effect: { kind: 'statMod', stat: 'mdf', rate: 0.1, turns: Infinity },
  },
  messengerFalcon: {
    id: 'messengerFalcon',
    name: '伝令のハヤブサ',
    description: '空から先を見通す俊敏な鳥。仲間の動きも軽くしてくれる。',
    effect: { kind: 'statMod', stat: 'spd', rate: 0.15, turns: Infinity },
  },
  sturdyTortoise: {
    id: 'sturdyTortoise',
    name: '頑丈なリクガメ',
    description: 'のんびり屋だが、その甲羅は誰よりも硬い。',
    effect: { kind: 'statMod', stat: 'def', rate: 0.15, turns: Infinity },
  },
} as const satisfies Record<string, Pet>;
