import { hashString, intAt } from '@mq/core';
import type { Aptitude, Grade } from '@mq/core';

const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * 主人公の素質を playerId から決定論的に引く。
 *
 * `Math.random` を使うと同じプレイヤーでも参加のたびに違う素質になり、
 * 「なぜこの主人公はこの成長率なのか」を後から誰も検証できなくなる。
 * core のシード付き乱数（hashString + intAt）に載せることで、
 * 同じ playerId からは何度計算しても必ず同じ素質が出るようにする。
 *
 * ハッシュに `hero-aptitude:` を混ぜているのは、他の用途（酒場の抽選など）が
 * 将来同じ playerId 文字列をシード材料に使い始めても、名前空間が
 * 分かれているので相関が出ないようにするため（tavernSeed 等と同じ考え方）。
 */
export function aptitudeFromPlayerId(playerId: string): Aptitude {
  const seed = hashString(`hero-aptitude:${playerId}`);
  const grade = (index: number): Grade => GRADES[intAt(seed, index, GRADES.length)];

  return {
    maxHp: grade(0),
    maxMp: grade(1),
    atk: grade(2),
    def: grade(3),
    mat: grade(4),
    mdf: grade(5),
    spd: grade(6),
  };
}
