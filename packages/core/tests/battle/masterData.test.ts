import { describe, it, expect } from 'vitest';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { createBattleState, findCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import { computeDamage } from '../../src/battle/damage.js';
import type { AttackerStats } from '../../src/battle/types.js';
import { computeStats } from '../../src/progression/stats.js';
import type { Aptitude, Character } from '../../src/progression/types.js';
import type { Job } from '../../src/progression/job.js';
import type { Skill } from '../../src/battle/skill.js';

/**
 * マスタデータが実行時に書き換えられないことの検査。
 * createBattleState はマスタの技オブジェクトを参照のまま Combatant に載せるので、
 * 1回の書き換えが以降すべての戦闘を汚染しうる。これは型で止める。
 *
 * この関数は「コンパイルが通らないこと」を確かめるためだけのもので、呼ばない。
 * 呼んでしまうと実際にマスタを壊してしまう。
 */
function neverCalled(): void {
  // @ts-expect-error 技のマスタは readonly
  SKILLS.slash.damage.power = 999;
  // @ts-expect-error 敵のステータスは readonly
  BALGOS.stats.maxHp = 1;
  // @ts-expect-error 行動表は readonly な配列
  BALGOS.pattern[0] = { skillId: 'frenzy' };
  // @ts-expect-error 激昂後の行動表も readonly な配列
  BALGOS.enrage.pattern[0] = { skillId: 'frenzy' };
  // @ts-expect-error 技の効果リストも readonly な配列
  SKILLS.armorBreak.effects[0] = SKILLS.guardChant.effects[0];
  // @ts-expect-error 敵の技リストの要素も readonly
  BALGOS.skills[3].damage.power = 9999;
  // @ts-expect-error 敵の技の効果ネスト先も readonly
  BALGOS.skills[2].effects[0].effect.turns = 99;
  // @ts-expect-error 職業の補正値は readonly
  JOBS.warrior.statBonus.atk = 999;
  // @ts-expect-error 習得表の要素の中身も readonly
  JOBS.warrior.learnset[0].id = 'meteor';
  // @ts-expect-error 習得表は readonly な配列
  JOBS.mage.learnset[0] = JOBS.warrior.learnset[0];
  // @ts-expect-error 上級職の解禁条件も readonly
  JOBS.paladin.requires[0].level = 1;
  // @ts-expect-error パッシブの効果も readonly
  PASSIVES.ironSkin.effect.rate = 9;
  // @ts-expect-error パッシブの効果の持続ターンも readonly
  PASSIVES.swiftFoot.effect.turns = 1;
}

const hero: PartyMember = {
  id: 'hero', name: '主人公',
  stats: { maxHp: 100, maxMp: 10, atk: 10, def: 10, mat: 10, mdf: 10, spd: 10 },
  skills: [SKILLS.slash],
};

describe('マスタデータ', () => {
  it('型レベルで書き換えを拒む（上の neverCalled が @ts-expect-error で守られている）', () => {
    expect(typeof neverCalled).toBe('function');
  });

  it('戦闘状態はマスタの技をそのまま参照する', () => {
    const state = createBattleState([hero], BALGOS);
    expect(findCombatant(state, 'hero').skills[0]).toBe(SKILLS.slash);
  });

  /**
   * DamageSpec.scaleが「威力の元にする能力」を実際に差し替えることの検査。
   * powerとdef/mdfを固定し、attackerのatkとspdだけを入れ替えて、
   * scale:'spd'の技がspdの値を、無指定の技がatkの値を見ていることを直接確かめる。
   * scaleOf の既定を書き換えたり、scale フィールドを無視するようにすると落ちる
   * （damage.ts の scaleOf 呼び出しを `spec.kind === 'physical' ? 'atk' : 'mat'` 固定に
   * 戻して手元で確認済み）。
   */
  it('DamageSpec.scaleは攻撃側のどの能力を使うかを実際に差し替える', () => {
    const attacker: AttackerStats = { atk: 10, def: 10, mat: 10, mdf: 10, spd: 200 };
    const input = { def: 0, mdf: 0, targetMaxHp: 1000, elementRate: 1, damageTakenRate: 1 };

    const atkScaled = computeDamage({
      ...input, attacker, spec: { kind: 'physical', power: 100 },
    });
    const spdScaled = computeDamage({
      ...input, attacker, spec: { kind: 'physical', power: 100, scale: 'spd' },
    });

    // spd(200) は atk(10) よりずっと大きいので、同じpowerでもscale:'spd'の方が強く出る
    expect(spdScaled).toBeGreaterThan(atkScaled);
  });

  /**
   * 仕様書の要求：「SPD/DEF技が、その能力に投資したキャラで実際に強くなること」を
   * 実在しうる数値で確認する。BASE_STATS/GROWTH_PER_LEVELから、冒険Lv50・
   * 素質A・盗賊ジョブLv30（statBonus spd2）まで育てたキャラのspdは
   * 10+1.2*49*1.3+2*30 ≈ 146。ここでは盗賊の主軸技 swiftStrike（scale:'spd'）が
   * 通常攻撃 slash（既定でatk基準）より実際に強く出ることを、そのスケール感の
   * 攻撃側ステータス（spd150・atkは素質Eで抑えた30）で見る。
   * DEF側も同じ考え方でパラディンの judgmentShield と slash を比較する。
   */
  it('SPD特化ビルドでは、SPD技がATK基準の技より強く出る', () => {
    const spdInvested: AttackerStats = { atk: 30, def: 30, mat: 30, mdf: 30, spd: 150 };
    const input = { def: 60, mdf: 60, targetMaxHp: 2000, elementRate: 1, damageTakenRate: 1 };

    const slashDamage = computeDamage({ ...input, attacker: spdInvested, spec: SKILLS.slash.damage! });
    const swiftStrikeDamage = computeDamage({
      ...input, attacker: spdInvested, spec: SKILLS.swiftStrike.damage!,
    });

    expect(swiftStrikeDamage).toBeGreaterThan(slashDamage);
  });

  it('DEF特化ビルドでは、DEF技がATK基準の技より強く出る', () => {
    const defInvested: AttackerStats = { atk: 30, def: 150, mat: 30, mdf: 30, spd: 30 };
    const input = { def: 60, mdf: 60, targetMaxHp: 2000, elementRate: 1, damageTakenRate: 1 };

    const slashDamage = computeDamage({ ...input, attacker: defInvested, spec: SKILLS.slash.damage! });
    const judgmentShieldDamage = computeDamage({
      ...input, attacker: defInvested, spec: SKILLS.judgmentShield.damage!,
    });

    expect(judgmentShieldDamage).toBeGreaterThan(slashDamage);
  });

  /**
   * 無消費（mpCost: 0）の技でpowerだけ高くすると、MPを気にせず毎ターン
   * 撃てる強技になってしまう。既存のslash（power100）を含め、全技を機械的に検査する。
   */
  it('MP消費0の技はpowerが120以下である', () => {
    for (const skill of Object.values(SKILLS)) {
      if (skill.mpCost !== 0) continue;
      if (skill.damage?.kind === 'physical' || skill.damage?.kind === 'magical') {
        expect(skill.damage.power, `${skill.id} はMP0なのにpowerが高すぎる`).toBeLessThanOrEqual(
          120,
        );
      }
    }
  });
});

describe('技がMPに見合っているか', () => {
  const FLAT_APTITUDE: Aptitude = {
    maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
  };
  const TARGET_DEF = 60;
  const TARGET_MDF = 40;
  const TARGET_MAX_HP = 2000;

  function statsFor(job: Job) {
    const character: Character = {
      id: 'probe', name: 'probe',
      adventureLevel: 20, adventureExp: 0,
      aptitude: FLAT_APTITUDE,
      currentJob: job.id,
      jobs: { [job.id]: { level: 20, exp: 0 } },
      learnedSkills: [], learnedPassives: [], equippedActive: [], equippedPassive: [],
    };
    return computeStats(character, job);
  }

  /**
   * MPを払う単体攻撃技が、無消費の通常攻撃（威力100・ATK基準）に負けていないこと。
   *
   * これは机上の balance 感覚ではなく、実際に一度起きた事故を捕まえるための検査。
   * scale を SPD にした技は、SPD の成長がATKの3分の1以下（1.2/Lv 対 4/Lv）
   * であるために、同じ power では無消費の通常攻撃に負ける。負けている技は
   * 誰も選ばないので、その職業の主軸として置いた意味がなくなる。
   *
   * 弱体・強化を伴う技（effects つき）は、威力ではなくその効果に価値があるので
   * 対象から外す。全体攻撃も、1発の威力では比べられないので外す。
   */
  it('MPを払う単体攻撃は、どの職業でも無消費の通常攻撃を上回る', () => {
    const weaker: string[] = [];

    for (const job of Object.values(JOBS)) {
      const stats = statsFor(job);
      const attacker = {
        atk: stats.atk, def: stats.def, mat: stats.mat, mdf: stats.mdf, spd: stats.spd,
      };
      const common = {
        attacker, def: TARGET_DEF, mdf: TARGET_MDF, targetMaxHp: TARGET_MAX_HP,
        elementRate: 1, damageTakenRate: 1,
      };
      const freeAttack = computeDamage({ ...common, spec: { kind: 'physical', power: 100 } });

      for (const entry of job.learnset) {
        if (entry.kind !== 'skill') continue;
        const skill: Skill = SKILLS[entry.id as keyof typeof SKILLS];
        if (!skill.damage) continue;
        if (skill.mpCost === 0) continue;
        if (skill.effects) continue;
        if (skill.target !== 'enemy') continue;

        const damage = computeDamage({ ...common, spec: skill.damage });
        if (damage <= freeAttack) {
          weaker.push(`${job.id}/${skill.id}: ${damage} <= ${freeAttack}`);
        }
      }
    }

    expect(weaker).toEqual([]);
  });
});
