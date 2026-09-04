import { describe, it, expect } from 'vitest';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { SKILLS } from '../../src/data/skills.js';
import { MAX_JOB_LEVEL } from '../../src/progression/curve.js';
import { ACTIVE_SLOTS, PASSIVE_SLOTS } from '../../src/progression/equip.js';
import type { LearnEntry } from '../../src/progression/job.js';

const jobs = Object.values(JOBS);

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
});
