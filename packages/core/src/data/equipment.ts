import type { StatBlock } from '../battle/types.js';

/** 装備の枠。キャラごとに武器1・防具1（設計書 §3）。装飾は作らない。 */
export type EquipmentSlot = 'weapon' | 'armor';

/**
 * 装備1つの定義。
 *
 * mods は加算のみ（設計書 §3 —「倍率にすると育つほど効きが増え、終盤で
 * 測り直しが必要になる」）。武器は ATK / MAT のどちらかを主にわずかな副次を、
 * 防具は DEF / MDF / maxHP のいずれかを主に据える。maxMp・spd を防具に
 * 持たせないのは設計書どおり「守り」に絞るため。
 */
export type Equipment = {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  /** 値段。recruitCost と釣り合わせてある（設計書 §5）。 */
  readonly cost: number;
  readonly mods: Partial<Readonly<Record<keyof StatBlock, number>>>;
};

/**
 * 武器10。ATK寄り・MAT寄りを両方、序盤(100〜300)・中盤(400〜900)・
 * 終盤(1200〜2500)の3段階で揃える（設計書 §5）。副次は主にSPD、
 * 魔法寄りの終盤武器だけMDFを少し足して「魔法職の生存力」に触れておく。
 */
export const WEAPONS = {
  rustedSword: {
    id: 'rustedSword', name: '錆びた剣', slot: 'weapon', cost: 100,
    mods: { atk: 3 },
  },
  apprenticeRod: {
    id: 'apprenticeRod', name: '見習いの杖', slot: 'weapon', cost: 100,
    mods: { mat: 3 },
  },
  huntersBow: {
    id: 'huntersBow', name: '猟師の弓', slot: 'weapon', cost: 200,
    mods: { atk: 4, spd: 1 },
  },
  sparkWand: {
    id: 'sparkWand', name: '火花の杖', slot: 'weapon', cost: 200,
    mods: { mat: 4, spd: 1 },
  },
  steelBlade: {
    id: 'steelBlade', name: '鋼の剣', slot: 'weapon', cost: 500,
    mods: { atk: 7, spd: 1 },
  },
  sagesRod: {
    id: 'sagesRod', name: '賢者の杖', slot: 'weapon', cost: 500,
    mods: { mat: 7, mdf: 1 },
  },
  galeEdge: {
    id: 'galeEdge', name: '疾風の剣', slot: 'weapon', cost: 750,
    mods: { atk: 8, spd: 2 },
  },
  tempestStaff: {
    id: 'tempestStaff', name: '嵐の杖', slot: 'weapon', cost: 750,
    mods: { mat: 8, spd: 2 },
  },
  dragonFang: {
    id: 'dragonFang', name: '竜牙の剣', slot: 'weapon', cost: 1800,
    mods: { atk: 13, spd: 2 },
  },
  archmageStaff: {
    id: 'archmageStaff', name: '大魔導の杖', slot: 'weapon', cost: 1800,
    mods: { mat: 13, mdf: 2 },
  },
} as const satisfies Record<string, Equipment>;

/**
 * 防具10。DEF寄り・MDF寄り・maxHP寄りを揃える（設計書 §3「防具は守り」）。
 * 序盤・中盤・終盤の3段階は武器と同じ価格帯。
 */
export const ARMORS = {
  clothVest: {
    id: 'clothVest', name: '布の胴着', slot: 'armor', cost: 100,
    mods: { def: 3 },
  },
  travelersCloak: {
    id: 'travelersCloak', name: '旅人のマント', slot: 'armor', cost: 100,
    mods: { mdf: 3 },
  },
  paddedJacket: {
    id: 'paddedJacket', name: '綿入れの上着', slot: 'armor', cost: 150,
    mods: { maxHp: 15 },
  },
  ironMail: {
    id: 'ironMail', name: '鉄の鎧', slot: 'armor', cost: 500,
    mods: { def: 7, maxHp: 10 },
  },
  mysticRobe: {
    id: 'mysticRobe', name: '神秘のローブ', slot: 'armor', cost: 500,
    mods: { mdf: 7, maxHp: 10 },
  },
  guardianPlate: {
    id: 'guardianPlate', name: '守護の板金鎧', slot: 'armor', cost: 700,
    mods: { maxHp: 35, def: 3 },
  },
  shadowWeave: {
    id: 'shadowWeave', name: '影織りの衣', slot: 'armor', cost: 750,
    mods: { mdf: 8, def: 2 },
  },
  dragonScaleMail: {
    id: 'dragonScaleMail', name: '竜鱗の鎧', slot: 'armor', cost: 1800,
    mods: { def: 13, maxHp: 40 },
  },
  seraphRobe: {
    id: 'seraphRobe', name: '天使のローブ', slot: 'armor', cost: 1800,
    mods: { mdf: 13, maxHp: 40 },
  },
  aegisPlate: {
    id: 'aegisPlate', name: '神盾の全身鎧', slot: 'armor', cost: 2400,
    mods: { maxHp: 70, def: 5, mdf: 5 },
  },
} as const satisfies Record<string, Equipment>;

/** 武器・防具をまとめたマスタ。IDはどちらの集合をとっても衝突しない。 */
export const EQUIPMENT: Readonly<Record<string, Equipment>> = { ...WEAPONS, ...ARMORS };

/**
 * 上げ幅の上限。装備一式（武器+防具）でも、素の能力の3割増しを超えない
 * （設計書 §2・§8 テスト7）。品揃えの数値を手で管理するだけだと、後から
 * 1つ足したアイテムが上限を破っていても気づけない。ここで機械的に
 * クランプすることで、品揃えがどう変わっても上限だけは常に守られる。
 */
const MAX_BOOST_RATE = 0.3;

/**
 * 装備の加算値を実効ステータスに足し込む。
 *
 * `computeStats` の結果（＝装備前の実効ステータス）を受け取り、そこに
 * 武器・防具のmodsを加算するだけの純粋関数。倍率は使わない（設計書 §3）。
 * 各ステータスごとに「装備前の値の30%」を上限にクランプするので、
 * 低レベルのキャラが終盤装備を先に手に入れても測り直しの原因にはならない
 * （設計書 §8 テスト7）。
 */
export function applyEquipment(
  stats: StatBlock,
  weapon: Equipment | null,
  armor: Equipment | null,
): StatBlock {
  const raw: Partial<Record<keyof StatBlock, number>> = {};
  for (const item of [weapon, armor]) {
    if (item === null) continue;
    for (const [key, value] of Object.entries(item.mods) as Array<[keyof StatBlock, number]>) {
      raw[key] = (raw[key] ?? 0) + value;
    }
  }

  const result: StatBlock = { ...stats };
  for (const key of Object.keys(raw) as Array<keyof StatBlock>) {
    const cap = Math.floor(stats[key] * MAX_BOOST_RATE);
    const bonus = Math.max(0, Math.min(raw[key] ?? 0, cap));
    result[key] = stats[key] + bonus;
  }
  return result;
}
