import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 5000, maxMp: 30, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 },
};
const heavy: Skill = {
  id: 'heavy', name: '渾身の一撃', mpCost: 20, cooldown: 3,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 300 },
};
const bite: Skill = {
  id: 'bite', name: '噛みつく', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [slash, heavy] };

function makeFoe(maxHp: number, spd = 5): Enemy {
  return {
    id: 'foe', name: '的',
    stats: { ...stats, maxHp, spd },
    skills: [bite],
    pattern: [{ skillId: 'bite' }],
  };
}

describe('simulate - 決着', () => {
  it('敵を倒しきれば win', () => {
    const plan: BattlePlan = { hero: ['slash', 'slash'] };
    const log = simulate([hero], makeFoe(150), plan);
    expect(log.result).toBe('win');
    expect(log.turns).toBe(2);
  });

  it('倒しきれずターン上限に達したら timeout', () => {
    const plan: BattlePlan = { hero: ['slash'] };
    const log = simulate([hero], makeFoe(99999), plan);
    expect(log.result).toBe('timeout');
    expect(log.turns).toBe(8);
  });

  it('味方が全滅したら lose', () => {
    const deadly: Enemy = {
      ...makeFoe(99999, 99),
      skills: [{ ...bite, damage: { kind: 'fixed', amount: 9999 } }],
    };
    const log = simulate([hero], deadly, { hero: ['slash'] });
    expect(log.result).toBe('lose');
  });

  it('最終イベントは end で、結果とターン数を持つ', () => {
    const log = simulate([hero], makeFoe(150), { hero: ['slash', 'slash'] });
    expect(log.events[log.events.length - 1]).toEqual({ t: 'end', result: 'win', turns: 2 });
  });
});

describe('simulate - プラン', () => {
  it('並べた技を1ターン目から順に使う', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['heavy', 'slash'] });
    const acts = log.events.filter((e) => e.t === 'act' && e.actorId === 'hero');
    expect(acts[0]).toEqual({ t: 'act', actorId: 'hero', skillId: 'heavy' });
    expect(acts[1]).toEqual({ t: 'act', actorId: 'hero', skillId: 'slash' });
  });

  it('プランが尽きたターンは何もしない', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['slash'] });
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'noAction' });
  });

  it('持っていない技を指したプランは unknownSkill として記録する', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['notASkill'] });
    const skips = log.events.filter((e) => e.t === 'skip' && e.actorId === 'hero');
    expect(skips[0]).toEqual({ t: 'skip', actorId: 'hero', reason: 'unknownSkill' });
  });

  it('意図的な空枠は noAction のまま', () => {
    const log = simulate([hero], makeFoe(99999), { hero: [null, 'slash'] });
    const skips = log.events.filter((e) => e.t === 'skip' && e.actorId === 'hero');
    expect(skips[0]).toEqual({ t: 'skip', actorId: 'hero', reason: 'noAction' });
  });

  it('MP が足りなければ空振りする', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['heavy', null, null, null, 'heavy'] });
    // MP30 で 20 の技を1回使うと 10 しか残らず、2回目は撃てない
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'noMp' });
  });

  it('クールダウン中の技は空振りする', () => {
    const rich: PartyMember = { ...hero, stats: { ...stats, maxMp: 200 } };
    const log = simulate([rich], makeFoe(99999), { hero: ['heavy', 'heavy'] });
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'cooldown' });
  });

  it('クールダウンが明けたら再び使える', () => {
    const rich: PartyMember = { ...hero, stats: { ...stats, maxMp: 200 } };
    const log = simulate([rich], makeFoe(99999), { hero: ['heavy', null, null, 'heavy'] });
    const acts = log.events.filter((e) => e.t === 'act' && e.actorId === 'hero');
    expect(acts).toHaveLength(2);
  });
});

describe('simulate - 効果の寿命', () => {
  const charge: Skill = {
    id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
    element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
  };

  /** 一番遅い（＝そのターンで最後に動く）敵。1ターン目に溜め、以降は噛みつく。 */
  const slowCharger: Enemy = {
    id: 'foe', name: '的',
    stats: { ...stats, maxHp: 99999, spd: 1 },
    skills: [bite, charge],
    pattern: [{ skillId: 'charge' }, { skillId: 'bite' }],
  };

  const plainFoe: Enemy = { ...slowCharger, pattern: [{ skillId: 'bite' }] };

  function heroDamageOnTurn(log: ReturnType<typeof simulate>, turn: number): number {
    const turnStarts = log.events
      .map((e, i) => (e.t === 'turnStart' && e.turn === turn ? i : -1))
      .filter((i) => i >= 0);
    const from = turnStarts[0];
    const to = log.events.findIndex((e, i) => i > from && e.t === 'turnStart');
    const slice = log.events.slice(from, to < 0 ? undefined : to);
    const hit = slice.find((e) => e.t === 'damage' && e.targetId === 'foe');
    return hit && hit.t === 'damage' ? hit.amount : 0;
  }

  it('一番遅い敵が1ターン目にかけた turns:1 の効果が、2ターン目の先頭の行動に乗る', () => {
    const plan: BattlePlan = { hero: ['slash', 'slash', 'slash'] };
    const boosted = heroDamageOnTurn(simulate([hero], slowCharger, plan), 2);
    const plainDamage = heroDamageOnTurn(simulate([hero], plainFoe, plan), 2);
    // 75 が 溜めの被ダメ +50% で 112 になる
    expect(plainDamage).toBe(75);
    expect(boosted).toBe(112);
  });

  it('turns:1 の効果は、その次のターンには切れている', () => {
    const plan: BattlePlan = { hero: ['slash', 'slash', 'slash'] };
    const log = simulate([hero], slowCharger, plan);
    expect(heroDamageOnTurn(log, 3)).toBe(75);
  });
});

describe('simulate - 決定論', () => {
  it('同じ入力からは同じログが出る', () => {
    const plan: BattlePlan = { hero: ['slash', 'heavy', 'slash'] };
    const a = simulate([hero], makeFoe(400), plan);
    const b = simulate([hero], makeFoe(400), plan);
    expect(a).toEqual(b);
  });

  it('速い側から順に行動する', () => {
    const log = simulate([hero], makeFoe(99999, 99), { hero: ['slash'] });
    const firstAct = log.events.find((e) => e.t === 'act');
    expect(firstAct).toEqual({ t: 'act', actorId: 'foe', skillId: 'bite' });
  });
});
