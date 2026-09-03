/** 冒険レベルの上限。 */
export const MAX_ADVENTURE_LEVEL = 50;

/** ジョブレベルの上限。上級職の解禁条件（Lv20）に余裕を持って届く。 */
export const MAX_JOB_LEVEL = 30;

/**
 * 次の冒険レベルまでに必要な経験値。
 * 二乗で増やすのは、デイリー制で1日1戦しか進まないため、
 * 後半のレベルが長期目標として機能するようにするため。
 */
export function adventureExpToNext(level: number): number {
  return 60 * level * level;
}

/**
 * 次のジョブレベルまでに必要な経験値。
 * 冒険レベルの半分の傾きにして、職業を試す敷居を低くしている。
 */
export function jobExpToNext(level: number): number {
  return 30 * level * level;
}
