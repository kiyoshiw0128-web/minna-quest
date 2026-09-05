import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { BattleEvent, BattleLog } from '../../src/battle/log.js';
import type { PartyMember } from '../../src/battle/state.js';
import { createCharacter } from '../../src/progression/unlock.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import type { Aptitude, Character } from '../../src/progression/types.js';

/**
 * 「溜めの窓」の仕掛けを検査するための、育ちきったパーティ。
 *
 * **7日目のプレイヤーの実像ではない。** 実際の7日目は冒険Lv2〜3で、
 * 渾身の一撃も氷嵐もまだ覚えていない。この一式が見ているのはエンジンの仕組み
 * （溜めで被ダメが増える、閾値を割ると激昂して行動表が切り替わる、
 * 激昂が早まると次の大技を飛ばせる）であって、第1章の難易度ではない。
 *
 * 第1章のバルゴスが7日目に本当に勝てるかは、下の別の describe で見る。
 */
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
  stats: { ...BALGOS.stats, maxHp: 4800, atk: 140, mat: 130 },
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

/**
 * 仕組みの検査に使うボス。バルゴスの行動表そのままで、数値だけ
 * 2026-09-05に下げる前のもの（HP4800・攻撃140・魔力130）に戻してある。
 *
 * **なぜ実データを使わないか。** 章ボスは7日目に来るが、その時点の
 * プレイヤーは冒険Lv2〜3で、溜めの窓に叩き込む大技をまだ覚えていない。
 * 実データのバルゴスを7日目に勝てる強さまで下げた結果、育ちきったパーティを
 * ぶつけると溜めの前に激昂してしまい、仕掛けが動く前に決着する。
 * 仕組みが壊れていないことと、第1章の難易度が妥当であることは別の話なので、
 * 別々に検査する。
 */
const PUZZLE_BOSS: Enemy = {
  ...BALGOS,
  stats: { ...BALGOS.stats, maxHp: 4800, atk: 140, mat: 130 },
};

describe('溜めの窓の仕掛け', () => {
  const intended = simulate(party, PUZZLE_BOSS, intendedPlan);

  it('想定解の並びなら勝てる', () => {
    expect(intended.result).toBe('win');
  });

  it('通常攻撃を並べただけでは勝てない', () => {
    expect(simulate(party, PUZZLE_BOSS, lazyPlan).result).not.toBe('win');
  });

  it('3ターン目にバルゴスが溜める', () => {
    expect(eventsOnTurn(intended, 3)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'charge',
    });
  });

  it('溜めの次のターンの火力が実際に増している', () => {
    const control = simulate(party, balgosWithoutCharge, intendedPlan);
    const withCharge = eventsOnTurn(intended, 4);
    const without = eventsOnTurn(control, 4);

    // 具体的な数値ではなく「1.5倍になっている」という関係で見る。
    // 数値で固定すると、バルゴスやキャラの調整のたびに書き換えることになり、
    // 何を検査していたのかが分からなくなる。溜めの効果は被ダメ +50% なので、
    // 同じ一撃が 1.5 倍になっていることが、この仕組みが効いている証拠。
    for (const index of [0, 1, 2]) {
      const base = damageToBalgos(without, index);
      const boosted = damageToBalgos(withCharge, index);
      expect(base, `対照の${index}発目が無い`).toBeDefined();
      expect(boosted, `溜め有りの${index}発目が無い`).toBeDefined();
      // 端数は切り捨ての位置で1だけずれうるので、比で見る。
      expect((boosted as number) / (base as number)).toBeCloseTo(1.5, 2);
    }
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
    const lazy = simulate(party, PUZZLE_BOSS, lazyPlan);
    expect(indexOfAct(lazy, 'blazingBurst')).toBeGreaterThanOrEqual(0);
    expect(eventsOnTurn(lazy, 4)).toContainEqual({
      t: 'act', actorId: 'balgos', skillId: 'blazingBurst',
    });
    expect(lazy.result).toBe('lose');
  });

  it('同じ入力からは同じ結果が出る', () => {
    const plan: BattlePlan = { warrior: ['slash'], mage: ['iceLance'], priest: ['holyLight'], thief: ['slash'] };
    expect(simulate(party, PUZZLE_BOSS, plan)).toEqual(simulate(party, PUZZLE_BOSS, plan));
  });
});

/**
 * 第1章のボスが7日目に本当に勝てるかの検査。
 *
 * 上の describe はエンジンの仕組みを見ているだけで、難易度は見ていない。
 * バルゴスは長らくHP4800で、育ちきったパーティ（冒険Lv50想定）を基準に
 * 置かれていた。ところが章ボスは7日目に来る。雑魚の報酬から逆算すると、
 * 7日目のプレイヤーは冒険Lv2〜3、金貨135〜250で、雇えるのは1〜2人。
 * つまり誰にも倒せない壁が立っていた。世界は誰か1人が倒せば進むが、
 * その1人が存在しなかった。
 *
 * ここで見るのは「備えた人なら勝てて、備えていない人は勝てない」こと。
 */
describe('第1章のボスが7日目に勝てるか', () => {
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

  /** 覚えている技のうち、いちばん威力の高いものを撃てるだけ撃つ素朴な並び。 */
  function plainPlan(members: readonly PartyMember[]): BattlePlan {
    const plan: BattlePlan = {};
    for (const member of members) {
      const best = [...member.skills].sort(
        (a, b) => (b.damage?.kind === 'physical' || b.damage?.kind === 'magical' ? b.damage.power : 0)
          - (a.damage?.kind === 'physical' || a.damage?.kind === 'magical' ? a.damage.power : 0),
      )[0];
      plan[member.id] = Array.from({ length: 8 }, () => best?.id ?? null);
    }
    return plan;
  }

  function fight(size: number, level: number) {
    const jobs: ('warrior' | 'priest' | 'mage')[] = ['warrior', 'priest', 'mage'];
    const members = jobs.slice(0, size).map((job, i) => memberAt(`m${i}`, job, level));
    return simulate(members, BALGOS, plainPlan(members));
  }

  it('Lv3が3人なら、素朴な並びでも勝てる', () => {
    expect(fight(3, 3).result).toBe('win');
  });

  it('Lv3が1人では勝てない', () => {
    expect(fight(1, 3).result).not.toBe('win');
  });

  it('Lv2が3人では勝てない', () => {
    expect(fight(3, 2).result).not.toBe('win');
  });
});
