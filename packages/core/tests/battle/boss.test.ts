import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { BattleEvent, BattleLog } from '../../src/battle/log.js';
import type { PartyMember } from '../../src/battle/state.js';

const warrior: PartyMember = {
  id: 'warrior', name: '戦士',
  stats: { maxHp: 900, maxMp: 60, atk: 150, def: 80, mat: 40, mdf: 40, spd: 22 },
  skills: [SKILLS.slash, SKILLS.heavyBlow, SKILLS.armorBreak],
};

const mage: PartyMember = {
  id: 'mage', name: '魔法使い',
  stats: { maxHp: 620, maxMp: 110, atk: 50, def: 40, mat: 165, mdf: 70, spd: 18 },
  skills: [SKILLS.iceLance, SKILLS.blizzard],
};

const priest: PartyMember = {
  id: 'priest', name: '僧侶',
  stats: { maxHp: 700, maxMp: 100, atk: 60, def: 55, mat: 130, mdf: 85, spd: 15 },
  skills: [SKILLS.holyLight, SKILLS.guardChant],
};

const thief: PartyMember = {
  id: 'thief', name: '盗賊',
  stats: { maxHp: 660, maxMp: 70, atk: 110, def: 50, mat: 60, mdf: 50, spd: 30 },
  skills: [SKILLS.slash, SKILLS.poisonDagger],
};

const party = [warrior, mage, priest, thief];

/**
 * 想定解。3ターン目の「溜め」で立つ被ダメ +50% の窓に、4ターン目の大技を全員でぶつける。
 * その一撃で HP が半分を切るため、バルゴスが4ターン目の自分の番に回ってくる前に激昂し、
 * 行動表 A の4マス目「灼熱爆発」は撃たれずに終わる。
 */
const intendedPlan: BattlePlan = {
  warrior: ['armorBreak', 'slash', 'slash', 'heavyBlow', 'slash', 'slash', 'heavyBlow', 'slash'],
  mage: ['iceLance', 'iceLance', 'iceLance', 'blizzard', 'iceLance', 'iceLance', 'blizzard', 'iceLance'],
  priest: ['guardChant', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight'],
  thief: ['poisonDagger', 'slash', 'slash', 'poisonDagger', 'slash', 'poisonDagger', 'slash', 'poisonDagger'],
};

const lazyRow = ['slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash'];
const lazyPlan: BattlePlan = {
  warrior: lazyRow,
  mage: ['iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance'],
  priest: lazyRow,
  thief: lazyRow,
};

/** 「溜め」だけを火炎の息に差し替えた対照用バルゴス。他はすべて同じ。 */
const balgosWithoutCharge: Enemy = {
  ...BALGOS,
  pattern: [
    { skillId: 'dragonBreath' },
    { skillId: 'intimidate' },
    { skillId: 'dragonBreath' },
    { skillId: 'blazingBurst' },
  ],
};

/** そのターンに起きた出来事だけを切り出す。 */
function eventsOnTurn(log: BattleLog, turn: number): BattleEvent[] {
  const from = log.events.findIndex((e) => e.t === 'turnStart' && e.turn === turn);
  if (from < 0) return [];
  const rest = log.events.slice(from + 1);
  const to = rest.findIndex((e) => e.t === 'turnStart');
  return to < 0 ? rest : rest.slice(0, to);
}

/** バルゴスに入った n 番目のダメージ量。 */
function damageToBalgos(events: BattleEvent[], index: number): number | undefined {
  const hits = events.filter((e) => e.t === 'damage' && e.targetId === 'balgos');
  const hit = hits[index];
  return hit && hit.t === 'damage' ? hit.amount : undefined;
}

function indexOfAct(log: BattleLog, skillId: string): number {
  return log.events.findIndex((e) => e.t === 'act' && e.skillId === skillId);
}

describe('炎竜バルゴス', () => {
  const intended = simulate(party, BALGOS, intendedPlan);

  it('想定解の並びなら勝てる', () => {
    expect(intended.result).toBe('win');
  });

  it('通常攻撃を並べただけでは勝てない', () => {
    expect(simulate(party, BALGOS, lazyPlan).result).not.toBe('win');
  });

  it('3ターン目にバルゴスが溜める', () => {
    expect(eventsOnTurn(intended, 3)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'charge',
    });
  });

  it('溜めの次のターンの火力が実際に増している', () => {
    const control = simulate(party, balgosWithoutCharge, intendedPlan);
    // 4ターン目の3発目＝魔法使いの氷嵐。溜めの被ダメ +50% が乗って 671 -> 1007
    expect(damageToBalgos(eventsOnTurn(control, 4), 2)).toBe(671);
    expect(damageToBalgos(eventsOnTurn(intended, 4), 2)).toBe(1007);
    // 盗賊の毒短剣（固定120）と戦士の渾身の一撃にも乗る
    expect(damageToBalgos(eventsOnTurn(intended, 4), 0)).toBe(180);
    expect(damageToBalgos(eventsOnTurn(intended, 4), 1)).toBe(370);
  });

  it('溜めに乗せた一撃で HP が半分を切り、4ターン目に激昂する', () => {
    const turn4 = eventsOnTurn(intended, 4);
    const enrageAt = turn4.findIndex((e) => e.t === 'enrage');
    const balgosActAt = turn4.findIndex((e) => e.t === 'act' && e.actorId === 'balgos');
    expect(enrageAt).toBeGreaterThanOrEqual(0);
    // 激昂はパーティの4ターン目の火力の後、バルゴス自身の番より前に起きる
    expect(enrageAt).toBeLessThan(balgosActAt);
    expect(eventsOnTurn(intended, 3).some((e) => e.t === 'enrage')).toBe(false);
  });

  it('激昂後は激昂用の行動表を1マス目から読む', () => {
    // 激昂したのは4ターン目。行動表 B は [狂乱の爪, 火炎の息] なので 4T=狂乱, 5T=火炎
    expect(eventsOnTurn(intended, 4)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'frenzy',
    });
    expect(eventsOnTurn(intended, 5)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'dragonBreath',
    });
  });

  it('とどめは灼熱爆発が解決するより前に入る', () => {
    const downAt = intended.events.findIndex((e) => e.t === 'down' && e.actorId === 'balgos');
    expect(downAt).toBeGreaterThanOrEqual(0);
    // 想定解では灼熱爆発は一度も撃たれない
    expect(indexOfAct(intended, 'blazingBurst')).toBe(-1);
  });

  it('削り切れなければ4ターン目の灼熱爆発で全滅する', () => {
    const lazy = simulate(party, BALGOS, lazyPlan);
    expect(indexOfAct(lazy, 'blazingBurst')).toBeGreaterThanOrEqual(0);
    expect(eventsOnTurn(lazy, 4)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'blazingBurst',
    });
    expect(lazy.result).toBe('lose');
  });

  it('同じ入力からは同じ結果が出る', () => {
    const plan: BattlePlan = { warrior: ['slash'], mage: ['iceLance'], priest: ['holyLight'], thief: ['slash'] };
    expect(simulate(party, BALGOS, plan)).toEqual(simulate(party, BALGOS, plan));
  });
});
