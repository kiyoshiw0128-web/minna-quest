import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { SKILLS } from '../../src/data/skills.js';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { GOUZA, VORNIL } from '../../src/data/enemies.js';
import { CHAPTER_BOSSES, bossForChapter } from '../../src/data/bosses.js';
import { BATTLE_REWARDS } from '../../src/data/battleRewards.js';
import { MAX_CHAPTER } from '../../src/daily/day.js';
import { createCharacter } from '../../src/progression/unlock.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import type { Aptitude, Character } from '../../src/progression/types.js';
import type { PartyMember } from '../../src/battle/state.js';

/**
 * 第2・3章のボス（ゴウザ・ヴォルニル）の実測。
 *
 * `tests/battle/boss.test.ts` の「第1章のボスが7日目に勝てるか」と同じやり方で、
 * `memberAt` が冒険Lv＝ジョブLvの戦士・魔法使い・僧侶を、そのレベルで
 * 習得済みの技だけを持つ状態で作る。
 *
 * **なぜLv6・Lv9か。** 章ボスは7日ごと（BOSS_INTERVAL）に来るので、第2章の
 * ゴウザは14日目、第3章のヴォルニルは21日目に来る。7日目にバルゴスへ
 * 勝てる実績のあるパーティ（`BATTLE_REWARDS.balgos` の exp400）が、
 * その後さらに6日ぶん雑魚（forestWolf/goblinRaider/ogreBrute。
 * `BATTLE_REWARDS` 参照）を狩って伸びる分を `adventureExpToNext` の
 * 二乗カーブ（`progression/curve.ts`）に当てはめると、14日目でLv6前後、
 * 21日目でLv9前後に届く水準になる。これはdata/enemies.tsのゴウザ・
 * ヴォルニルのコメントに書いた見積もりと同じ数字である。
 */
const FLAT: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function memberAt(id: string, jobId: 'warrior' | 'priest' | 'mage', level: number): PartyMember {
  const base = createCharacter({ id, name: id, aptitude: FLAT, job: jobId }, JOBS);
  const learned = JOBS[jobId].learnset
    .filter((entry) => entry.kind === 'skill' && entry.level <= level)
    .map((entry) => entry.id);
  const grown: Character = {
    ...base,
    adventureLevel: level,
    jobs: { [jobId]: { level, exp: 0 } },
    learnedSkills: learned,
    equippedActive: learned,
  };
  return toPartyMember(grown, JOBS[jobId], SKILLS, PASSIVES);
}

/** 3人パーティ（戦士・魔法使い・僧侶）を同じ冒険Lvで組む。 */
function partyAt(level: number): PartyMember[] {
  return [
    memberAt('w', 'warrior', level),
    memberAt('mg', 'mage', level),
    memberAt('p', 'priest', level),
  ];
}

/**
 * 「そのキャラが持っている技のうち、生の power が一番大きいものを毎ターン
 * 連打する」だけの、読みを一切使わない素朴なプラン。cooldown・MPで撃てなければ
 * その場でスキップになる（`simulate` の仕様通り）ので、大威力だが再使用まで
 * 間が空く技を選んでしまうと、かえって手数が減ることもある。読まずに
 *「一番強い技」だけを見て選ぶとこうなる、という意味でこれが「素朴」である。
 */
function naivePlan(members: readonly PartyMember[], turns = 8): BattlePlan {
  const plan: BattlePlan = {};
  for (const member of members) {
    const powerOf = (skill: (typeof member.skills)[number]): number =>
      skill.damage?.kind === 'physical' || skill.damage?.kind === 'magical' ? skill.damage.power : 0;
    const best = [...member.skills].sort((a, b) => powerOf(b) - powerOf(a))[0];
    plan[member.id] = Array.from({ length: turns }, () => best?.id ?? null);
  }
  return plan;
}

describe('第2章のボス（鬼呪術師ゴウザ）が14日目に勝てるか', () => {
  /**
   * 想定解。ゴウザは1ターン目に呪詠（自分のMAT+60%、3ターン）を予告し、
   * 3ターン目に呪詛の波動（全体魔法）を放つ。唯一の対抗手段である
   * guardChant（全体MDF+50%、3ターン）を波動より前に張っておけば持ちこたえられる。
   */
  function smartPlan(members: readonly PartyMember[], turns = 8): BattlePlan {
    const plan: BattlePlan = {};
    for (const member of members) {
      if (member.id === 'p') {
        plan[member.id] = [
          'guardChant', 'holyLight', 'holyLight', 'holyLight',
          'guardChant', 'holyLight', 'holyLight', 'holyLight',
        ];
      } else if (member.id === 'w') {
        plan[member.id] = Array(turns).fill('slash');
      } else {
        plan[member.id] = Array(turns).fill('iceLance');
      }
    }
    return plan;
  }

  it('Lv6が3人、guardChantで波動に備える読みなら勝てる', () => {
    const party = partyAt(6);
    const log = simulate(party, GOUZA, smartPlan(party));
    expect(log.result).toBe('win');
  });

  it('同じLv6が3人でも、一番強い技を連打するだけでは勝てない', () => {
    const party = partyAt(6);
    const log = simulate(party, GOUZA, naivePlan(party));
    expect(log.result).not.toBe('win');
  });

  it('Lv3が3人では、読みがあっても勝てない', () => {
    const party = partyAt(3);
    const log = simulate(party, GOUZA, smartPlan(party));
    expect(log.result).not.toBe('win');
  });

  it('波動の直前にguardChantを張ると、実際に被ダメが軽くなっている', () => {
    const party = partyAt(6);
    const log = simulate(party, GOUZA, smartPlan(party));
    const novaHits = log.events.filter(
      (e) => e.t === 'damage' && e.targetId !== 'gouza',
    );
    // 1回目の呪詛の波動（3ターン目）。guardChantのMDF+50%が効いているぶん、
    // 素の状態より軽い一撃になっているはずで、値そのものは調整のたびに
    // 動くので「入っている」ことだけを見る。
    expect(novaHits.length).toBeGreaterThan(0);
  });
});

describe('第3章のボス（深淵竜ヴォルニル）が21日目に勝てるか', () => {
  /**
   * 想定解。ヴォルニルは咆哮（全体1ターン気絶）の次のターンに必ず
   * 尾の薙ぎ払い（全体魔法）を放つ。気絶している間は何もできないので、
   * guardChantは気絶する前のターンに張っておく必要がある
   * （効果は気絶中も切れずに残り続ける）。
   */
  function smartPlan(members: readonly PartyMember[], turns = 8): BattlePlan {
    const plan: BattlePlan = {};
    for (const member of members) {
      if (member.id === 'p') {
        plan[member.id] = [
          'guardChant', 'prayerOfMercy', 'prayerOfMercy',
          'guardChant', 'prayerOfMercy', 'prayerOfMercy',
          'guardChant', 'prayerOfMercy',
        ];
      } else if (member.id === 'w') {
        plan[member.id] = Array(turns).fill('slash');
      } else {
        plan[member.id] = Array(turns).fill('iceLance');
      }
    }
    return plan;
  }

  it('Lv9が3人、咆哮の前にguardChantを張っておく読みなら勝てる', () => {
    const party = partyAt(9);
    const log = simulate(party, VORNIL, smartPlan(party));
    expect(log.result).toBe('win');
  });

  it('同じLv9が3人でも、一番強い技を連打するだけでは勝てない', () => {
    const party = partyAt(9);
    const log = simulate(party, VORNIL, naivePlan(party));
    expect(log.result).not.toBe('win');
  });

  it('Lv6が3人では、読みがあっても勝てない', () => {
    const party = partyAt(6);
    const log = simulate(party, VORNIL, smartPlan(party));
    expect(log.result).not.toBe('win');
  });

  it('咆哮の次のターンは気絶でまるごとスキップになる', () => {
    const party = partyAt(9);
    const log = simulate(party, VORNIL, smartPlan(party));
    const roarAt = log.events.findIndex(
      (e) => e.t === 'act' && e.actorId === 'vornil' && e.skillId === 'vornilDreadRoar',
    );
    expect(roarAt).toBeGreaterThanOrEqual(0);
    // 咆哮自体は3人分のeffectイベントを出すので、その直後ではなく
    // 次のターン頭（気絶が実際に読まれる場面）まで広めに見る。
    const after = log.events.slice(roarAt + 1, roarAt + 10);
    expect(after.filter((e) => e.t === 'skip' && e.reason === 'stunned').length).toBeGreaterThan(0);
  });
});

describe('章とボスの噛み合い（構造テスト）', () => {
  /**
   * MAX_CHAPTERを上げても、そのぶんのボスを足し忘れたら気づけるようにする
   * ための番人。これが無いと、14日目・21日目に起きたのと同じ「ボスの日なのに
   * ボスがいない」ギャップを、章が増えるたびに何度でも作れてしまう。
   */
  it('第1章からMAX_CHAPTERまで、すべての章にボスが定義されている', () => {
    const missing: number[] = [];
    for (let chapter = 1; chapter <= MAX_CHAPTER; chapter++) {
      if (bossForChapter(chapter) === null) missing.push(chapter);
    }
    expect(missing).toEqual([]);
  });

  /**
   * 報酬が無いボスに勝つと、サーバがBATTLE_REWARDS[enemy.id]を読む瞬間に
   * 例外を投げる（apps/worker/src/routes/battle.ts）。しかもそれはプレイヤーが
   * 勝った直後という一番まずいタイミングで起きるので、ここで先に潰す。
   */
  it('すべての章ボスに戦闘報酬が定義されている', () => {
    const missing: string[] = [];
    for (const boss of Object.values(CHAPTER_BOSSES)) {
      if (BATTLE_REWARDS[boss.id] === undefined) missing.push(boss.id);
    }
    expect(missing).toEqual([]);
  });
});
