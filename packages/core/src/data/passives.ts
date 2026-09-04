import type { Passive } from '../progression/types.js';

/**
 * パッシブのマスタ。戦闘開始時から永続でかかるため turns は Infinity。
 * StatKey は maxHp / maxMp を含まないので、最大HPを上げるパッシブは作れない。
 */
export const PASSIVES = {
  battleInstinct: {
    id: 'battleInstinct', name: '戦いの勘',
    effect: { kind: 'statMod', stat: 'atk', rate: 0.2, turns: Infinity },
  },
  ironSkin: {
    id: 'ironSkin', name: '鉄の肌',
    effect: { kind: 'statMod', stat: 'def', rate: 0.2, turns: Infinity },
  },
  arcaneMind: {
    id: 'arcaneMind', name: '魔道の心得',
    effect: { kind: 'statMod', stat: 'mat', rate: 0.2, turns: Infinity },
  },
  swiftFoot: {
    id: 'swiftFoot', name: '俊足',
    effect: { kind: 'statMod', stat: 'spd', rate: 0.2, turns: Infinity },
  },

  // ここから追加分。既存4つの数値・IDは変えていない。

  /** mdfの初段パッシブ。既存4つ（atk/def/mat/spd）にmdfが無かった穴を埋める。 */
  stoneWill: {
    id: 'stoneWill', name: '剛毅',
    effect: { kind: 'statMod', stat: 'mdf', rate: 0.2, turns: Infinity },
  },
  /** 被ダメージそのものを減らす防御パッシブ。ironSkinのDEF強化とは別軸の耐久。 */
  guardianStance: {
    id: 'guardianStance', name: '鉄壁の構え',
    effect: { kind: 'damageTaken', rate: -0.15, turns: Infinity },
  },
  /** battleInstinctの上位版。ATK特化職の高レベル帯用。 */
  berserkerFury: {
    id: 'berserkerFury', name: '闘気',
    effect: { kind: 'statMod', stat: 'atk', rate: 0.3, turns: Infinity },
  },
  /** ironSkinの上位版。 */
  adamantGuard: {
    id: 'adamantGuard', name: '金剛の肌',
    effect: { kind: 'statMod', stat: 'def', rate: 0.3, turns: Infinity },
  },
  /** arcaneMindの上位版。 */
  mysticFocus: {
    id: 'mysticFocus', name: '魔導の極意',
    effect: { kind: 'statMod', stat: 'mat', rate: 0.3, turns: Infinity },
  },
  /** swiftFootの上位版。 */
  lightFeet: {
    id: 'lightFeet', name: '疾風の心得',
    effect: { kind: 'statMod', stat: 'spd', rate: 0.3, turns: Infinity },
  },
  /** stoneWillの上位版。 */
  holyBlessing: {
    id: 'holyBlessing', name: '神威',
    effect: { kind: 'statMod', stat: 'mdf', rate: 0.3, turns: Infinity },
  },
  /** guardianStanceの上位版。パラディンの「守りが攻めになる」を最後まで支える。 */
  absoluteGuard: {
    id: 'absoluteGuard', name: '絶対防御',
    effect: { kind: 'damageTaken', rate: -0.25, turns: Infinity },
  },
} as const satisfies Record<string, Passive>;
