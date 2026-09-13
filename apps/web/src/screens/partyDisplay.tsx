import type { Effect, StatBlock } from '@mq/core';

const STAT_LABEL: Record<string, string> = { atk: 'ATK', def: 'DEF', mat: 'MAT', mdf: 'MDF', spd: 'SPD' };

export function effectLabel(effect: Effect): string {
  if (effect.kind === 'statMod') return `${STAT_LABEL[effect.stat] ?? effect.stat} +${Math.round(effect.rate * 100)}%`;
  if (effect.kind === 'damageTaken') return `被ダメージ ${Math.round(effect.rate * 100)}%`;
  return `${effect.turns}ターン行動不能`;
}

export const STAT_ORDER: readonly (keyof StatBlock)[] = ['maxHp', 'maxMp', 'atk', 'def', 'mat', 'mdf', 'spd'];

export const STAT_SHORT: Readonly<Record<keyof StatBlock, string>> = {
  maxHp: 'HP', maxMp: 'MP', atk: 'ATK', def: 'DEF', mat: 'MAT', mdf: 'MDF', spd: 'SPD',
};

/**
 * 能力値の一覧。
 *
 * 「HP 128 / MP 20 / ATK 15 / ...」と1行に流していたが、7項目が横に繋がると
 * どれがどれだか目で追えない。項目名の下に数字を置いた格子にして、
 * 縦の位置で項目を探せるようにする。装備の前後を見比べるのもこの形なら効く。
 */
export function StatGrid({ stats, diff }: { stats: StatBlock; diff?: StatBlock }) {
  return (
    <dl className="stat-grid">
      {STAT_ORDER.map((key) => {
        const delta = diff === undefined ? 0 : stats[key] - diff[key];
        return (
          <div key={key} className="stat-cell">
            <dt>{STAT_SHORT[key]}</dt>
            <dd>
              {stats[key]}
              {delta !== 0 && (
                <span className={delta > 0 ? 'stat-up' : 'stat-down'}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

