import { describe, it, expect } from 'vitest';
import { gainExp } from '../../src/progression/exp.js';
import { changeJob, isUnlocked, createCharacter } from '../../src/progression/unlock.js';
import { equipActive, equipPassive } from '../../src/progression/equip.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { computeStats } from '../../src/progression/stats.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { simulate } from '../../src/battle/simulate.js';
import type { Character, Aptitude } from '../../src/progression/types.js';
import type { Enemy } from '../../src/battle/enemy.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function fresh(): Character {
  return createCharacter({ id: 'hero', name: '主人公', aptitude: flat, job: 'warrior' }, JOBS);
}

/**
 * ok/reason の結果を開く。失敗したら投げる。
 * `if (!result.ok) return;` で守ると、操作が壊れたときにテストが
 * 何も検査しないまま緑で終わってしまうため。
 */
function unwrap<T>(result: { ok: true; character: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`操作が失敗した: ${result.reason}`);
  return result.character;
}

/** ジョブレベルを目標まで上げる。冒険レベルは動かさない。 */
function trainJob(character: Character, target: number): Character {
  let current = character;
  while ((current.jobs[current.currentJob]?.level ?? 1) < target) {
    current = gainExp(current, { adventure: 0, job: 5000 }, JOBS).character;
  }
  return current;
}

describe('育成の通し', () => {
  it('作った直後から初期職の技を持っている', () => {
    const hero = fresh();
    expect(hero.learnedSkills).toContain('slash');
    expect(hero.equippedActive).toContain('slash');
  });

  it('戦士を育てるとジョブレベルで技を覚える', () => {
    // heavyBlowは戦士Lv18で覚える（jobs.ts参照）
    const trained = trainJob(fresh(), 18);
    expect(trained.learnedSkills).toContain('slash');
    expect(trained.learnedSkills).toContain('provoke');
    expect(trained.learnedSkills).toContain('heavyBlow');
  });

  it('転職しても冒険レベルと習得済みは失われない', () => {
    const trained = gainExp(trainJob(fresh(), 18), { adventure: 100000, job: 0 }, JOBS).character;
    const level = trained.adventureLevel;
    const changed = unwrap(changeJob(trained, 'priest', JOBS));
    expect(changed.adventureLevel).toBe(level);
    expect(changed.learnedSkills).toContain('heavyBlow');
    expect(changed.jobs['priest']).toEqual({ level: 1, exp: 0 });
  });

  it('2つの職業を育てると上級職が解禁される', () => {
    let hero = trainJob(fresh(), 20);
    expect(isUnlocked(hero, JOBS.paladin)).toBe(false);

    hero = trainJob(unwrap(changeJob(hero, 'priest', JOBS)), 15);

    expect(isUnlocked(hero, JOBS.paladin)).toBe(true);

    const toPaladin = unwrap(changeJob(hero, 'paladin', JOBS));
    expect(toPaladin.currentJob).toBe('paladin');
  });

  it('上級職に就くとステータスが上がる', () => {
    let hero = trainJob(fresh(), 20);
    const asWarrior = computeStats(hero, JOBS.warrior);

    hero = trainJob(unwrap(changeJob(hero, 'priest', JOBS)), 15);
    const trained = trainJob(unwrap(changeJob(hero, 'paladin', JOBS)), 20);

    const asPaladin = computeStats(trained, JOBS.paladin);
    expect(asPaladin.def).toBeGreaterThan(asWarrior.def);
  });

  it('育てた結果がそのまま戦闘の強さになる', () => {
    const dummy: Enemy = {
      id: 'dummy', name: '木人',
      stats: { maxHp: 3000, maxMp: 0, atk: 1, def: 40, mat: 1, mdf: 40, spd: 1 },
      skills: [SKILLS.slash],
      pattern: [{ skillId: 'slash' }],
    };

    // createCharacter が装備済みでも、比較を「slash 1本」に揃えるため付け直す
    function damageDealt(character: Character): number {
      const member = toPartyMember(
        unwrap(equipActive(character, ['slash'])), JOBS.warrior, SKILLS, PASSIVES,
      );
      const log = simulate([member], dummy, { hero: ['slash'] }, { maxTurns: 1 });
      const hit = log.events.find((event) => event.t === 'damage');
      if (!hit || hit.t !== 'damage') throw new Error('no damage event');
      return hit.amount;
    }

    const rookie = trainJob(fresh(), 1);
    const veteran = gainExp(trainJob(fresh(), 20), { adventure: 200000, job: 0 }, JOBS).character;

    expect(damageDealt(veteran)).toBeGreaterThan(damageDealt(rookie));
  });

  it('パッシブを装備すると戦闘に効く', () => {
    // 殴ってくるだけの敵。こちらは何もせず、受けたダメージだけを見る。
    const bruiser: Enemy = {
      id: 'bruiser', name: '乱暴者',
      stats: { maxHp: 9999, maxMp: 0, atk: 200, def: 1, mat: 1, mdf: 1, spd: 99 },
      skills: [SKILLS.slash],
      pattern: [{ skillId: 'slash' }],
    };

    function damageTaken(character: Character): number {
      const member = toPartyMember(character, JOBS.warrior, SKILLS, PASSIVES);
      const log = simulate([member], bruiser, { hero: [null] }, { maxTurns: 1 });
      return log.events
        .filter((event) => event.t === 'damage' && event.targetId === 'hero')
        .reduce((total, event) => total + (event.t === 'damage' ? event.amount : 0), 0);
    }

    // ironSkin は戦士レベル15で覚える（def +20%）。Lv16まで育てれば確実に習得済み
    const trained = unwrap(equipActive(trainJob(fresh(), 16), ['slash']));
    const guarded = unwrap(equipPassive(trained, ['ironSkin']));

    const bare = damageTaken(trained);
    const withPassive = damageTaken(guarded);

    expect(bare).toBeGreaterThan(0);
    expect(withPassive).toBeLessThan(bare);
  });

  /**
   * ユーザーが明示的に求めた保証：ある職業で覚えた技は、別の職業に移っても、
   * 戻ってきても消えない。applyLearns は learnedSkills に足すだけで
   * 引かないので保証されるはずだが、それは実装の詳細であって仕様ではない。
   * ここでは魔物使い→戦士→魔物使いという実際の転職を通しで確認する。
   */
  it('魔物使いで覚えた技は転職しても、戻ってきても消えない', () => {
    const tamer = createCharacter({ id: 'hero', name: '主人公', aptitude: flat, job: 'beastTamer' }, JOBS);
    expect(tamer.learnedSkills).toContain('petFang');

    const asWarrior = unwrap(changeJob(tamer, 'warrior', JOBS));
    expect(asWarrior.learnedSkills).toContain('petFang');

    const backToTamer = unwrap(changeJob(asWarrior, 'beastTamer', JOBS));
    expect(backToTamer.learnedSkills).toContain('petFang');
    // 戻ってきたときの魔物使いの進み具合（レベル1のまま）も保持されている
    expect(backToTamer.jobs['beastTamer']).toEqual({ level: 1, exp: 0 });
  });

  /**
   * ペット技（requiresPet: true）は、simulateにhasPetを渡すかどうかで
   * 実際に発動が分かれることを確認する。canUseを直接呼ぶのではなく、
   * simulateの結果イベントとして見るのは、サーバがsimulateの出力しか
   * 見ないため（simulate.tsのSimulateOptions参照）。
   */
  it('ペット技はペットを連れていないとnoPetでスキップされ、連れていれば発動する', () => {
    const tamer = createCharacter({ id: 'hero', name: '主人公', aptitude: flat, job: 'beastTamer' }, JOBS);
    const equipped = unwrap(equipActive(tamer, ['petFang']));
    const member = toPartyMember(equipped, JOBS.beastTamer, SKILLS, PASSIVES);

    const foe: Enemy = {
      id: 'foe', name: '的',
      stats: { maxHp: 9999, maxMp: 0, atk: 1, def: 1, mat: 1, mdf: 1, spd: 1 },
      skills: [SKILLS.slash],
      pattern: [{ skillId: 'slash' }],
    };

    const withoutPet = simulate([member], foe, { hero: ['petFang'] }, { maxTurns: 1 });
    const skipped = withoutPet.events.find(
      (event) => event.t === 'skip' && event.actorId === 'hero',
    );
    expect(skipped).toEqual({ t: 'skip', actorId: 'hero', reason: 'noPet' });
    // 的は反撃してこないのでダメージイベントが出るとすればhero発。noPetのときは0でなければならない。
    expect(withoutPet.events.some((event) => event.t === 'damage' && event.targetId === 'foe')).toBe(
      false,
    );

    const withPet = simulate([member], foe, { hero: ['petFang'] }, { maxTurns: 1, hasPet: true });
    expect(withPet.events.some((event) => event.t === 'damage' && event.targetId === 'foe')).toBe(
      true,
    );
  });
});
