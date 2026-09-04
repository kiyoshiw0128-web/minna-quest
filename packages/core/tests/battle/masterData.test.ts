import { describe, it, expect } from 'vitest';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { createBattleState, findCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';

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
});
