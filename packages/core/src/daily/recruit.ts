import { drawWithout, intAt } from './rng.js';
import type { Aptitude, Grade, JobId } from '../progression/types.js';

/** 酒場に日替わりで並ぶ人数。 */
export const RECRUITS_PER_DAY = 3;

const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D', 'E'];

const GRADE_VALUE: Readonly<Record<Grade, number>> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

/** 素質の項目数 × 最高評価。全項目Aのときの総合点。 */
const MAX_QUALITY = 7 * 4;

/** レベル1あたりの基本価格。 */
const COST_PER_LEVEL = 80;

export type Recruit = {
  readonly id: string;
  readonly name: string;
  readonly jobId: JobId;
  readonly aptitude: Aptitude;
  readonly adventureLevel: number;
  readonly cost: number;
};

/** 素質の総合点。全項目Aで28、全項目Eで0。 */
export function aptitudeQuality(aptitude: Aptitude): number {
  return (
    GRADE_VALUE[aptitude.maxHp] +
    GRADE_VALUE[aptitude.maxMp] +
    GRADE_VALUE[aptitude.atk] +
    GRADE_VALUE[aptitude.def] +
    GRADE_VALUE[aptitude.mat] +
    GRADE_VALUE[aptitude.mdf] +
    GRADE_VALUE[aptitude.spd]
  );
}

/**
 * 雇用の値段。冒険レベルに比例し、素質では最大2倍までしか上がらない。
 * この形にすると、素質の高い低レベル人材のほうが安くなり、
 * 育てる日数がそのままコストになる。デイリー制なので日数が一番高くつく。
 */
export function recruitCost(adventureLevel: number, aptitude: Aptitude): number {
  const quality = aptitudeQuality(aptitude);
  return Math.floor(COST_PER_LEVEL * adventureLevel * (1 + quality / MAX_QUALITY));
}

/** シードの引き位置。人ごとに離しておき、項目同士が相関しないようにする。 */
const SLOT_STRIDE = 100;

function gradeAt(seed: number, index: number): Grade {
  return GRADES[intAt(seed, index, GRADES.length)];
}

/**
 * その日の酒場に並ぶ顔ぶれを決める。
 * シードが共通なので全員が同じ3人を見る。
 * 名前は非復元抽出なので、同じ人物が2人並ぶことはない。
 *
 * idPrefix は生成される Recruit のIDの前半分になる。
 * シードは32bitのハッシュなので別々の世界が同じ値に潰れうる。
 * IDをシードから作ると世界をまたいで衝突するため、
 * 呼び出し側が世界と日を一意に表す文字列（例: `${worldId}:${dayNo}`）を渡す。
 */
export function rollRecruits(
  seed: number,
  idPrefix: string,
  names: readonly string[],
  jobIds: readonly JobId[],
  maxLevel: number,
): readonly Recruit[] {
  if (maxLevel < 1) {
    throw new Error(`rollRecruits: maxLevel must be at least 1: ${maxLevel}`);
  }
  if (names.length < RECRUITS_PER_DAY) {
    throw new Error(
      `rollRecruits: names must have at least ${RECRUITS_PER_DAY} entries: ${names.length}`,
    );
  }

  const picked = drawWithout(seed, names, RECRUITS_PER_DAY);

  return picked.map((name, slot) => {
    const base = (slot + 1) * SLOT_STRIDE;
    const aptitude: Aptitude = {
      maxHp: gradeAt(seed, base + 1),
      maxMp: gradeAt(seed, base + 2),
      atk: gradeAt(seed, base + 3),
      def: gradeAt(seed, base + 4),
      mat: gradeAt(seed, base + 5),
      mdf: gradeAt(seed, base + 6),
      spd: gradeAt(seed, base + 7),
    };
    const adventureLevel = intAt(seed, base + 8, maxLevel) + 1;

    return {
      id: `${idPrefix}-${slot}`,
      name,
      jobId: jobIds[intAt(seed, base + 9, jobIds.length)],
      aptitude,
      adventureLevel,
      cost: recruitCost(adventureLevel, aptitude),
    };
  });
}
