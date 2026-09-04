import { describe, it, expect } from 'vitest';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { SKILLS } from '../../src/data/skills.js';
import { MAX_JOB_LEVEL } from '../../src/progression/curve.js';
import { ACTIVE_SLOTS, PASSIVE_SLOTS } from '../../src/progression/equip.js';
import type { LearnEntry } from '../../src/progression/job.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatKey } from '../../src/battle/types.js';

const jobs = Object.values(JOBS);

/**
 * content-brief.mdの「職業ごとの主軸」表をそのままコード化したもの。
 * 複数指定の職業（ranger/spellblade）は「両方」が求められているので、
 * 表現としては「そのどちらかで伸びる技が1本以上」ではなく、後続のテストで
 * 個別に判定する。単一指定の職業はここに1要素で並べる。
 */
const PRIMARY_AXIS: Readonly<Record<string, readonly StatKey[]>> = {
  warrior: ['atk'],
  monk: ['atk'],
  mage: ['mat'],
  priest: ['mdf'],
  thief: ['spd'],
  ranger: ['spd', 'mat'],
  paladin: ['def'],
  spellblade: ['atk', 'mat'],
  sage: ['mat'],
};

/**
 * damage.tsのscaleOfと同じ既定ルール（物理はatk、魔法はmat）。
 * exportされていないのでテスト側で再現する。healはhealScale、既定はmat。
 */
function skillScales(skill: Skill): readonly StatKey[] {
  const scales: StatKey[] = [];
  if (skill.damage?.kind === 'physical' || skill.damage?.kind === 'magical') {
    scales.push(skill.damage.scale ?? (skill.damage.kind === 'physical' ? 'atk' : 'mat'));
  }
  if (skill.heal !== undefined) {
    scales.push(skill.healScale ?? 'mat');
  }
  return scales;
}

/** その職業が覚える技（learnedスキルのみ、パッシブは除く）を解決する。 */
function learnedSkills(job: (typeof jobs)[number]): Skill[] {
  const entries: readonly LearnEntry[] = job.learnset;
  return entries
    .filter((entry) => entry.kind === 'skill')
    .map((entry) => SKILLS[entry.id as keyof typeof SKILLS]);
}

describe('職業マスタの健全性', () => {
  it('キーと id が一致している', () => {
    for (const [key, job] of Object.entries(JOBS)) {
      expect(job.id).toBe(key);
    }
  });

  it('習得表が指す技はすべて存在する', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        if (entry.kind === 'skill') {
          expect(Object.keys(SKILLS)).toContain(entry.id);
        }
      }
    }
  });

  it('習得表が指すパッシブはすべて存在する', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        if (entry.kind === 'passive') {
          expect(Object.keys(PASSIVES)).toContain(entry.id);
        }
      }
    }
  });

  it('習得レベルはすべて上限以内', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        expect(entry.level).toBeGreaterThanOrEqual(1);
        expect(entry.level).toBeLessThanOrEqual(MAX_JOB_LEVEL);
      }
    }
  });

  it('上級職の条件が指す職業はすべて存在する', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(Object.keys(JOBS)).toContain(requirement.jobId);
      }
    }
  });

  it('上級職の条件は上限以内で達成できる', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(requirement.level).toBeLessThanOrEqual(MAX_JOB_LEVEL);
      }
    }
  });

  it('基本職は条件を持たず、上級職は持つ', () => {
    for (const job of jobs) {
      if (job.tier === 'basic') expect(job.requires).toHaveLength(0);
      else expect(job.requires.length).toBeGreaterThan(0);
    }
  });

  it('上級職の条件は基本職だけを指す（上級職の連鎖を作らない）', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(JOBS[requirement.jobId as keyof typeof JOBS].tier).toBe('basic');
      }
    }
  });

  it('どの職業もレベル1で技を1つ覚える', () => {
    for (const job of jobs) {
      const atOne = job.learnset.filter((entry) => entry.level === 1);
      expect(atOne.length).toBeGreaterThan(0);
    }
  });

  /**
   * createCharacter は初期職のレベル1の習得をそのまま装備する。枠数を見ないので、
   * レベル1で枠より多く覚える職業を足すと、ルール上ありえない数の技を持った
   * キャラが戦闘エンジンまで届いてしまう。今のマスタでは起きないが、
   * 将来の職業追加で越えたらここで気づけるようにしておく。
   */
  it('レベル1で覚えるものは装備枠に収まる', () => {
    for (const job of jobs) {
      // マスタの as const で kind が絞り込まれて検査が空回りしないよう、
      // 一般の LearnEntry として扱う。
      const atOne: readonly LearnEntry[] = job.learnset.filter((entry) => entry.level === 1);
      const skills = atOne.filter((entry) => entry.kind === 'skill');
      const passives = atOne.filter((entry) => entry.kind === 'passive');
      expect(skills.length).toBeLessThanOrEqual(ACTIVE_SLOTS);
      expect(passives.length).toBeLessThanOrEqual(PASSIVE_SLOTS);
    }
  });

  it('パッシブのキーと id が一致している', () => {
    for (const [key, passive] of Object.entries(PASSIVES)) {
      expect(passive.id).toBe(key);
    }
  });

  it('パッシブは永続である', () => {
    for (const passive of Object.values(PASSIVES)) {
      expect(passive.effect.turns).toBe(Infinity);
    }
  });

  /**
   * content-brief.mdの「職業ごとの主軸」表と実データが一致していることの検査。
   * 「勝てる」ではなく「その能力で伸びる技を持っているか」を見る。
   * 主軸をATKからDEFに書き換える、あるいはscale指定ごと消すと、この検査が落ちる
   * ことを確認済み（手動でSKILLS.judgmentShield.damage.scaleを外して確認した）。
   */
  it('各職業が覚える技に、主軸として指定した能力で伸びる技が1本以上ある', () => {
    for (const job of jobs) {
      const axis = PRIMARY_AXIS[job.id];
      expect(axis, `${job.id} の主軸が PRIMARY_AXIS に定義されていない`).toBeDefined();

      const matches = learnedSkills(job).filter((skill) =>
        skillScales(skill).some((scale) => axis.includes(scale)),
      );
      expect(
        matches.length,
        `${job.id} は主軸(${axis.join('/')})で伸びる技を持っていない`,
      ).toBeGreaterThan(0);
    }
  });

  it('狩人はSPDで伸びる物理とMATで伸びる属性矢の両方を持つ', () => {
    const skills = learnedSkills(JOBS.ranger);
    const hasSpdPhysical = skills.some(
      (skill) => skill.damage?.kind === 'physical' && skill.damage.scale === 'spd',
    );
    const hasMatMagical = skills.some(
      (skill) =>
        skill.damage?.kind === 'magical' && (skill.damage.scale ?? 'mat') === 'mat',
    );
    expect(hasSpdPhysical).toBe(true);
    expect(hasMatMagical).toBe(true);
  });

  it('魔剣士はATKとMAT両方で伸びる技を持つ', () => {
    const skills = learnedSkills(JOBS.spellblade);
    const hasAtk = skills.some(
      (skill) =>
        skill.damage?.kind === 'physical' && (skill.damage.scale ?? 'atk') === 'atk',
    );
    const hasMat = skills.some(
      (skill) =>
        skill.damage?.kind === 'magical' && (skill.damage.scale ?? 'mat') === 'mat',
    );
    expect(hasAtk).toBe(true);
    expect(hasMat).toBe(true);
  });

  it('僧侶はMDFで回復する技を持つ（healScale: mdf）', () => {
    const skills = learnedSkills(JOBS.priest);
    expect(skills.some((skill) => skill.heal !== undefined && skill.healScale === 'mdf')).toBe(
      true,
    );
  });
});
