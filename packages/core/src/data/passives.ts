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
} as const satisfies Record<string, Passive>;
