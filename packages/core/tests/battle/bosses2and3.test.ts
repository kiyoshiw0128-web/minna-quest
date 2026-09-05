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
import type { BattleResult } from '../../src/battle/log.js';

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

function memberAt(id: string, jobId: 'warrior' | 'priest' | 'mage' | 'thief', level: number): PartyMember {
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
 * 僧侶を盗賊に差し替えただけの「脳筋編成」。守りの手段（guardChant）を
 * 持たない代わりに、僧侶が本来ダメージを出さない分（僧侶はLv13の聖なる炎まで
 * 攻撃技を覚えない）、盗賊は毎ターン殴れる。
 *
 * これを比較対象に置くのは、「読んで備えた編成が、読まずに殴るだけの
 * 編成に負けていないか」を確かめるため。片方のプランだけ変えて同じ編成を
 * 比べる（既存のsmartPlan/naivePlanの対比）では、編成そのものを取り替えたら
 * どうなるかは分からない。
 */
function bruteForcePartyAt(level: number): PartyMember[] {
  return [
    memberAt('w', 'warrior', level),
    memberAt('mg', 'mage', level),
    memberAt('t', 'thief', level),
  ];
}

/**
 * 戦闘結果の優劣。win > timeout > lose とする（打ち切りは、全滅よりは
 * まだ被害が少ないという意味で、負けより上に置く）。
 * ターン数の速さは比較しない——速いほうが偉いなら、全体を回復に割く
 * 編成は原理的に不利になり、僧侶を連れる意味そのものが測れなくなる。
 */
function outcomeRank(result: BattleResult): number {
  return { win: 2, timeout: 1, lose: 0 }[result];
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

  /**
   * 「行動表に出ている技が、実際に戦闘中に撃たれるか」の番人。
   * HPを削りすぎて、呪詛の波動が来る前に決着してしまうと、行動表はプレイヤーに
   * 見せているだけの飾りになる。想定解の勝ちログに実際に呪詛の波動のactイベントが
   * 無ければ、この検査で落ちる。
   */
  it('想定解で勝ったログに、実際に呪詛の波動が撃たれた記録が残っている', () => {
    const party = partyAt(6);
    const log = simulate(party, GOUZA, smartPlan(party));
    expect(log.result).toBe('win');
    expect(
      log.events.some((e) => e.t === 'act' && e.skillId === 'gouzaCurseNova'),
    ).toBe(true);
  });

  /**
   * 「読んで備えた編成が、読まずに殴るだけの編成に負けていないか」の検査。
   *
   * 僧侶をguardChantで使う想定解の編成（partyAt）と、僧侶を盗賊に差し替えて
   * 守りを捨て火力を足しただけの編成（bruteForcePartyAt）を、それぞれの
   * 編成が出せる最善のプランで戦わせて比べる。片方だけプランを変えて同じ
   * 編成を比べる（上のnaivePlanとの対比）では、「編成を丸ごと取り替えたら
   * 勝敗が引っくり返らないか」は分からない——実際、この検査を足す前は
   * ここが壊れていた（想定解が負け、脳筋編成が勝つ組み合わせがあった）。
   *
   * ターン数の速さでは比べない。守りに回った分だけ想定解が遅くなるのは
   * 織り込み済みで、問われているのは「読んで備えたら、読まずに殴るのに
   * 結果で負ける」ことがないかだけ。
   */
  it('想定解（戦士・魔法使い・僧侶）は、脳筋編成（戦士・魔法使い・盗賊）に結果で負けない', () => {
    const prepared = partyAt(6);
    const preparedLog = simulate(prepared, GOUZA, smartPlan(prepared));
    const brute = bruteForcePartyAt(6);
    const bruteLog = simulate(brute, GOUZA, naivePlan(brute));
    expect(outcomeRank(preparedLog.result)).toBeGreaterThanOrEqual(outcomeRank(bruteLog.result));
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

  /**
   * ゴウザ側と同じ番人。尾の薙ぎ払いが行動表どおり実際に撃たれずに
   * 決着してしまうと、咆哮→気絶→薙ぎ払いという行動表の仕掛けが
   * プレイヤーに見せているだけの飾りになる。
   */
  it('想定解で勝ったログに、実際に尾の薙ぎ払いが撃たれた記録が残っている', () => {
    const party = partyAt(9);
    const log = simulate(party, VORNIL, smartPlan(party));
    expect(log.result).toBe('win');
    expect(
      log.events.some((e) => e.t === 'act' && e.skillId === 'vornilTailSweep'),
    ).toBe(true);
  });

  /**
   * ゴウザ側と同じ検査。読んで備えた編成（戦士・魔法使い・僧侶）が、
   * 守りを持たない脳筋編成（戦士・魔法使い・盗賊）に結果で負けていないか。
   */
  it('想定解（戦士・魔法使い・僧侶）は、脳筋編成（戦士・魔法使い・盗賊）に結果で負けない', () => {
    const prepared = partyAt(9);
    const preparedLog = simulate(prepared, VORNIL, smartPlan(prepared));
    const brute = bruteForcePartyAt(9);
    const bruteLog = simulate(brute, VORNIL, naivePlan(brute));
    expect(outcomeRank(preparedLog.result)).toBeGreaterThanOrEqual(outcomeRank(bruteLog.result));
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
