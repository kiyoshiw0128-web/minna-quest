import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';
import type { BattleReward } from './battleRewards.js';

/**
 * 闘技場（段階5）の20階。設計書 `docs/superpowers/specs/2026-09-06-arena-design.md`
 * §3.2/3.3 に対応する。
 *
 * 本編の雑魚（`enemies.ts`）は一切流用しない。行動表がプレイヤーに公開される
 * 前提の遊びなので、行動表が同じ敵は同じパズルになり、使い回すと20階ぶんの
 * 手応えが1階ぶんに縮む（設計書§3.2）。
 *
 * 各階は「その階で問う型」を1つ持ち、隣り合う階では型を変えている
 * （A溜め→大技 / B周期全体攻撃 / C速度低下 / D高い防御 / E属性耐性の偏り /
 * F激昂二段、をA→B→C→D→E→Fの順で循環させ、20階だけ二段構えの最終形にした）。
 *
 * 数値はすべて `simulate` の実測で決めている（乱数が無いので「だいたい勝てる」は
 * 存在しない）。想定パーティ・想定レベルで7ターン以内に勝て、8ターン目を
 * 安全余白として残す（既存の雑魚敵と同じ流儀）。想定の半分のレベルでは
 * 8ターンでも勝てないことも確認済み。
 */

const atk = (id: string, name: string, power: number): Skill => ({
  id, name, mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
  damage: { kind: 'physical', power },
});

// ============================================================
// 1〜5階: 冒険Lv3〜8想定。本編第1章を進めていれば手が届く帯。
// ============================================================

/**
 * 1階・Lv3・戦士1人・型A(溜め→大技)。
 * 「牽制の一撃」を2回はさんで「身構える」(被ダメ+40%、1ターン)を溜め、
 * 4マス目の「捨て身の突き」に叩き込む型。溜めの窓は本フロアでは必須ではなく、
 * 素直な連打でも実測でLv3が7ターン目に勝てる（Lv1では8ターンでも削り切れない）。
 */
const ASPIRANT: Enemy = {
  id: 'arenaAspirant', name: '闘技場の新兵',
  stats: { maxHp: 212, maxMp: 0, atk: 22, def: 10, mat: 19, mdf: 8, spd: 12 },
  skills: [atk('aspirantJab', '牽制の一撃', 90), {
    id: 'aspirantBrace', name: '身構える', mpCost: 0, cooldown: 0, element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.4, turns: 1 } }],
  }, atk('aspirantBurst', '捨て身の突き', 220)],
  pattern: [{ skillId: 'aspirantJab' }, { skillId: 'aspirantJab' }, { skillId: 'aspirantBrace' }, { skillId: 'aspirantBurst' }],
};

/**
 * 2階・Lv4・戦士+僧侶・型B(周期全体攻撃、回復の置き方を問う)。
 * 3マスごとに来る「遠吠えの衝撃」(全体)を、僧侶の癒やしの光で受け止め続けられるか。
 * 実測: 戦士が殴り続け僧侶が毎ターン回復する並びでLv4が7ターンで勝ち、
 * Lv2では8ターンでも決着しない。
 */
const HOWLER: Enemy = {
  id: 'arenaHowler', name: '遠吠えの豺狼',
  stats: { maxHp: 224, maxMp: 0, atk: 26, def: 10, mat: 22, mdf: 8, spd: 12 },
  skills: [atk('howlerBite', '牙撃ち', 90), {
    id: 'howlerHowl', name: '遠吠えの衝撃', mpCost: 0, cooldown: 0, element: 'none', target: 'allEnemies',
    damage: { kind: 'magical', power: 130 },
  }],
  pattern: [{ skillId: 'howlerBite' }, { skillId: 'howlerBite' }, { skillId: 'howlerHowl' }],
};

/**
 * 3階・Lv5・盗賊1人・型C(速度低下、行動順の読み替えを問う)。
 * 「鎖縛り」で自分のSPDを-60%(3ターン)されても崩れない立ち回りが要る。
 * 実測: Lv5が7ターンで勝ち、Lv2では8ターンでも削り切れない。
 */
const SHACKLER: Enemy = {
  id: 'arenaShackler', name: '重り鎖の罠師',
  stats: { maxHp: 238, maxMp: 0, atk: 31, def: 10, mat: 26, mdf: 8, spd: 13 },
  skills: [atk('shacklerHook', '鎖の一撃', 90), {
    id: 'shacklerShackle', name: '鎖縛り', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'spd', rate: -0.6, turns: 3 } }],
  }],
  pattern: [{ skillId: 'shacklerHook' }, { skillId: 'shacklerShackle' }, { skillId: 'shacklerHook' }],
};

/**
 * 4階・Lv6・盗賊1人・型D(高い防御、固定ダメージへの持ち替えを問う)。
 * DEF70は、この帯の斬撃(power90)がほとんど通らない値。防御力を無視する
 * 毒短剣(fixed 120)に持ち替えられるかが分かれ目。
 * 実測: 毒短剣に持ち替えたLv6が7ターンで勝つ一方、斬りつけ連打（素朴な解）は
 * Lv6でも8ターンで削り切れない。半分のLv3では毒短剣に持ち替えても勝てない。
 */
const IRONHIDE: Enemy = {
  id: 'arenaIronhide', name: '鉄皮の重装兵',
  stats: { maxHp: 480, maxMp: 0, atk: 35, def: 70, mat: 29, mdf: 8, spd: 14 },
  skills: [atk('ironhideBash', '重い一撃', 90)],
  pattern: [{ skillId: 'ironhideBash' }],
};

/**
 * 5階・Lv8・魔法使い1人・型E(属性耐性の偏り、属性を選ばせる)。
 * 氷を強く耐性(0.3倍)、雷を弱点(1.6倍)に振ってある。魔法使いの初手は
 * 氷の槍だが、雷撃に持ち替えられるかが分かれ目。
 * 実測: 雷撃に持ち替えたLv8が7ターンで勝つ一方、氷を撃ち続ける（素朴な解）は
 * Lv8でも8ターンで削り切れない。第1章帯の締めとしてLv8想定。
 */
const FROSTBACK: Enemy = {
  id: 'arenaFrostback', name: '氷背の守り手',
  stats: { maxHp: 1106, maxMp: 0, atk: 44, def: 10, mat: 36, mdf: 8, spd: 15 },
  skills: [atk('frostbackSlam', '尾撃ち', 90)],
  pattern: [{ skillId: 'frostbackSlam' }],
  resist: { ice: 0.3, thunder: 1.6 },
};

// ============================================================
// 6〜12階: 冒険Lv10〜20想定。転職と装備を使い分けないと勝てない帯。
// ============================================================

/**
 * 6階・Lv10・戦士+僧侶・型F(激昂二段)。
 * HPが半分を切ると「怒りの乱打」を含む行動表に切り替わる。前半は殴って
 * いいが、後半は僧侶の回復が要る。実測: Lv10が7ターンで勝ち、Lv5では
 * 8ターンでも決着しない。
 */
const TWOFACED: Enemy = {
  id: 'arenaTwofaced', name: '双貌の傭兵',
  stats: { maxHp: 469, maxMp: 0, atk: 53, def: 15, mat: 43, mdf: 13, spd: 16 },
  skills: [atk('twofacedSlash', '片手斬り', 90), atk('twofacedRage', '怒りの乱打', 170)],
  pattern: [{ skillId: 'twofacedSlash' }, { skillId: 'twofacedSlash' }],
  enrage: { hpRate: 0.5, pattern: [{ skillId: 'twofacedRage' }, { skillId: 'twofacedSlash' }] },
};

/**
 * 7階・Lv12・戦士+武闘家・型A(溜め→大技)。
 * 「振りかぶり」(被ダメ+50%、1ターン)の窓に「粉砕の一撃」が続く。
 * 実測: Lv12が7ターンで勝ち、Lv6では8ターンでも決着しない。
 */
const JUGGERNAUT: Enemy = {
  id: 'arenaJuggernaut', name: '巨槌の闘士',
  stats: { maxHp: 2127, maxMp: 0, atk: 62, def: 15, mat: 50, mdf: 13, spd: 17 },
  skills: [atk('juggernautSwing', '大槌の振り', 90), {
    id: 'juggernautWindup', name: '振りかぶり', mpCost: 0, cooldown: 0, element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
  }, atk('juggernautCrush', '粉砕の一撃', 260)],
  pattern: [{ skillId: 'juggernautSwing' }, { skillId: 'juggernautSwing' }, { skillId: 'juggernautWindup' }, { skillId: 'juggernautCrush' }],
};

/**
 * 8階・Lv14・僧侶+戦士・型B(周期全体攻撃)。
 * 「雷鳴」(全体・雷属性)が3マスごとに来る。回復の置き方を問う点は2階と
 * 同じ型だが、威力とレベル帯が上がっている。実測: Lv14が7ターンで勝ち、
 * Lv7では8ターンでも決着しない。
 */
const STORMCALLER: Enemy = {
  id: 'arenaStormcaller', name: '雷雲の呼び手',
  stats: { maxHp: 644, maxMp: 0, atk: 71, def: 15, mat: 57, mdf: 13, spd: 18 },
  skills: [atk('stormcallerClaw', '稲妻の爪', 90), {
    id: 'stormcallerThunderclap', name: '雷鳴', mpCost: 0, cooldown: 0, element: 'thunder', target: 'allEnemies',
    damage: { kind: 'magical', power: 210 },
  }],
  pattern: [{ skillId: 'stormcallerClaw' }, { skillId: 'stormcallerClaw' }, { skillId: 'stormcallerThunderclap' }],
};

/**
 * 9階・Lv16・盗賊+狩人・型C(速度低下)。
 * 「粘糸」でSPD-70%(3ターン)。実測: Lv16が7ターンで勝ち、Lv8では
 * 8ターンでも決着しない。
 */
const WEBSPINNER: Enemy = {
  id: 'arenaWebspinner', name: '糸繰りの狩人',
  stats: { maxHp: 1782, maxMp: 0, atk: 80, def: 15, mat: 64, mdf: 13, spd: 20 },
  skills: [atk('webspinnerSting', '毒針', 90), {
    id: 'webspinnerWeb', name: '粘糸', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'spd', rate: -0.7, turns: 3 } }],
  }],
  pattern: [{ skillId: 'webspinnerSting' }, { skillId: 'webspinnerWeb' }, { skillId: 'webspinnerSting' }],
};

/**
 * 10階・Lv18・盗賊+戦士・型D(高い防御)。
 * DEF150。盗賊の鎧砕き(pierce 0.5)で防御を削れるかが分かれ目。
 * 実測: 鎧砕きを使ったLv18が7ターンで勝つ一方、素朴な連打はLv18でも
 * 8ターンで削り切れない。
 */
const BASTION: Enemy = {
  id: 'arenaBastion', name: '要塞の番兵',
  stats: { maxHp: 596, maxMp: 0, atk: 89, def: 150, mat: 71, mdf: 13, spd: 21 },
  skills: [atk('bastionRam', '体当たり', 90)],
  pattern: [{ skillId: 'bastionRam' }],
};

/**
 * 11階・Lv19・魔法使い+僧侶・型E(属性耐性の偏り)。
 * 火を強く耐性(0.2倍)、氷を弱点(1.5倍)に振ってある。
 * 実測: 氷の棺に持ち替えたLv19が7ターンで勝つ一方、素朴な解（火力最大の技を
 * 撃ち続ける）はLv19でも8ターンで削り切れない。
 */
const CINDERLORD: Enemy = {
  id: 'arenaCinderlord', name: '灰塵の領主',
  stats: { maxHp: 2408, maxMp: 0, atk: 94, def: 15, mat: 75, mdf: 13, spd: 21 },
  skills: [atk('cinderlordScorch', '灼熱の爪', 90)],
  pattern: [{ skillId: 'cinderlordScorch' }],
  resist: { fire: 0.2, ice: 1.5 },
};

/**
 * 12階・Lv20・戦士+魔法使い・型F(激昂二段)。6〜12階の締め。
 * HP45%で「狂咆の連撃」を含む行動表に切り替わる。実測: Lv20が7ターンで
 * 勝ち、Lv10では8ターンでも決着しない。
 */
const DIREWOLF_KING: Enemy = {
  id: 'arenaDirewolfKing', name: '双牙の王狼',
  stats: { maxHp: 4534, maxMp: 0, atk: 98, def: 15, mat: 78, mdf: 13, spd: 22 },
  skills: [atk('direwolfBite', '牙による一撃', 90), atk('direwolfHowlrage', '狂咆の連撃', 200)],
  pattern: [{ skillId: 'direwolfBite' }, { skillId: 'direwolfBite' }],
  enrage: { hpRate: 0.45, pattern: [{ skillId: 'direwolfHowlrage' }, { skillId: 'direwolfBite' }] },
};

// ============================================================
// 13〜19階: 冒険Lv22〜35想定。上級職と、覚えた技の持ち込みが要る帯。
// ============================================================

/**
 * 13階・Lv22・パラディン+戦士+僧侶・型A(溜め→大技)。
 * 実測: Lv22が7ターンで勝ち、Lv11では8ターンでも決着しない。
 */
const WARBRINGER: Enemy = {
  id: 'arenaWarbringer', name: '戦禍を運ぶ者',
  stats: { maxHp: 6275, maxMp: 0, atk: 107, def: 15, mat: 85, mdf: 13, spd: 23 },
  skills: [atk('warbringerCleave', '薙ぎ払い', 90), {
    id: 'warbringerBrace', name: '大上段の構え', mpCost: 0, cooldown: 0, element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
  }, atk('warbringerGreatcleave', '大薙刀の一閃', 340)],
  pattern: [{ skillId: 'warbringerCleave' }, { skillId: 'warbringerCleave' }, { skillId: 'warbringerBrace' }, { skillId: 'warbringerGreatcleave' }],
};

/**
 * 14階・Lv24・僧侶+パラディン+魔法使い・型B(周期全体攻撃)。
 * 「大津波」が3マスごとに来る。実測: 僧侶が癒しの波動で全体を支え続ける
 * 並びでLv24が7ターンで勝ち、Lv12では8ターンでも決着しない。
 */
const TIDECALLER: Enemy = {
  id: 'arenaTidecaller', name: '大津波の呼び手',
  stats: { maxHp: 4160, maxMp: 0, atk: 116, def: 15, mat: 92, mdf: 13, spd: 24 },
  skills: [atk('tidecallerSurge', '波撃ち', 90), {
    id: 'tidecallerTsunami', name: '大津波', mpCost: 0, cooldown: 0, element: 'none', target: 'allEnemies',
    damage: { kind: 'magical', power: 260 },
  }],
  pattern: [{ skillId: 'tidecallerSurge' }, { skillId: 'tidecallerSurge' }, { skillId: 'tidecallerTsunami' }],
};

/**
 * 15階・Lv26・盗賊+狩人+武闘家・型C(速度低下)。
 * 実測: Lv26が7ターンで勝ち、Lv13では8ターンでも決着しない。
 */
const TIME_THIEF: Enemy = {
  id: 'arenaTimeThief', name: '刻盗みの魔女',
  stats: { maxHp: 7100, maxMp: 0, atk: 125, def: 20, mat: 99, mdf: 18, spd: 26 },
  skills: [atk('timeThiefCurse', '呪爪', 90), {
    id: 'timeThiefSlowfield', name: '緩慢の呪い', mpCost: 0, cooldown: 0, element: 'none', target: 'enemy',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'spd', rate: -0.7, turns: 3 } }],
  }],
  pattern: [{ skillId: 'timeThiefCurse' }, { skillId: 'timeThiefSlowfield' }, { skillId: 'timeThiefCurse' }],
};

/**
 * 16階・Lv28・パラディン+盗賊+狩人・型D(高い防御)。
 * DEF220。パラディンの裁きの盾(DEFスケール)、盗賊の鎧砕き(pierce)、
 * 狩人の急所撃ち(ratio、防御無視)のいずれかで崩す。実測: 3人がそれぞれの
 * 持ち替え技を使ったLv28が7ターンで勝つ一方、素朴な連打はLv28でも
 * 8ターンで削り切れない。
 */
const AEGIS_TITAN: Enemy = {
  id: 'arenaAegisTitan', name: '大盾の巨人',
  stats: { maxHp: 2110, maxMp: 0, atk: 134, def: 220, mat: 106, mdf: 18, spd: 27 },
  skills: [atk('aegisTitanSlam', '大盾叩き', 90)],
  pattern: [{ skillId: 'aegisTitanSlam' }],
};

/**
 * 17階・Lv30・魔法使い+賢者+僧侶・型E(属性耐性の偏り)。
 * 闇を強く耐性(0.2倍)、聖を弱点(1.6倍)に振ってある。魔法使いの手持ちに
 * 聖属性は無いので、雷撃(耐性の対象外)か僧侶の聖なる炎に頼ることになる。
 * 実測: 雷撃+聖なる炎の組み合わせでLv30が7ターンで勝つ一方、素朴な解は
 * Lv30でも8ターンで削り切れない。
 */
const VOID_PRIESTESS: Enemy = {
  id: 'arenaVoidPriestess', name: '虚無の巫女',
  stats: { maxHp: 5803, maxMp: 0, atk: 143, def: 20, mat: 113, mdf: 18, spd: 28 },
  skills: [atk('voidPriestessSmite', '闇の一撃', 90)],
  pattern: [{ skillId: 'voidPriestessSmite' }],
  resist: { dark: 0.2, holy: 1.6 },
};

/**
 * 18階・Lv32・魔剣士+戦士+僧侶・型F(激昂二段)。
 * HP40%で「黄昏の剣閃」を含む行動表に切り替わる。実測: Lv32が7ターンで
 * 勝ち、Lv16では8ターンでも決着しない。
 */
const DUSK_KNIGHT: Enemy = {
  id: 'arenaDuskKnight', name: '黄昏の剣聖',
  stats: { maxHp: 10687, maxMp: 0, atk: 152, def: 20, mat: 120, mdf: 18, spd: 29 },
  skills: [atk('duskKnightParry', '受け流しの一撃', 90), atk('duskKnightBlade', '黄昏の剣閃', 260)],
  pattern: [{ skillId: 'duskKnightParry' }, { skillId: 'duskKnightParry' }],
  enrage: { hpRate: 0.4, pattern: [{ skillId: 'duskKnightBlade' }, { skillId: 'duskKnightParry' }] },
};

/**
 * 19階・Lv35・賢者+パラディン+武闘家・型A(溜め→大技)。19階までの締め。
 * 「力を込める」(被ダメ+60%、1ターン)の窓に「滅殺の一撃」が続く、
 * この帯でもっとも重い一撃。実測: Lv35が7ターンで勝ち、Lv17では
 * 8ターンでも決着しない。
 */
const ARCH_TYRANT: Enemy = {
  id: 'arenaArchTyrant', name: '暴虐の大公',
  stats: { maxHp: 16810, maxMp: 0, atk: 166, def: 20, mat: 131, mdf: 18, spd: 31 },
  skills: [atk('archTyrantGrind', '圧し潰し', 90), {
    id: 'archTyrantBrace', name: '力を込める', mpCost: 0, cooldown: 0, element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.6, turns: 1 } }],
  }, atk('archTyrantAnnihilate', '滅殺の一撃', 420)],
  pattern: [{ skillId: 'archTyrantGrind' }, { skillId: 'archTyrantGrind' }, { skillId: 'archTyrantBrace' }, { skillId: 'archTyrantAnnihilate' }],
};

// ============================================================
// 20階: 裏ボス。19階までをすべて倒した人だけが挑める（判定はサーバ側）。
// ============================================================

/**
 * 20階・裏ボス「深淵の覇王」。
 *
 * 設計書§3.3が指す「第1章のボスで成立しなかった溜めの窓のパズルを、ここで
 * 成立させる」を体現する敵。バルゴス（`enemies.ts`）は3ターン目の「溜め」で
 * 立つ窓に4ターン目の大技を叩き込むと、大技が来る前に激昂して回避できる
 * ―― という想定解を持つが、Lv3向けに弱体化した結果、素直な連打でも
 * 勝ててしまい問いとして機能しなくなった（`enemies.ts` のBALGOSのコメント参照）。
 *
 * ここでは「溜め」の窓は大技回避の手段ではなく、大技（終焉の波動、全体・闇属性）
 * そのものを耐える手段として使う。3ターンごとに来る終焉の波動は、
 * 守りの詠唱(MDF+50%、全体、3ターン)を溜めのタイミングに合わせて重ねがけ
 * しておかないと、いちばん柔らかい仲間が即死するだけの威力に調整してある。
 *
 * **素朴な並び（=一番強い技を撃ち続けるだけの並び。守りの詠唱のような
 * 支援技はpower値を持たないため、この解び方では選ばれない）では勝てないことを
 * 実測で保証している。**
 * 冒険Lv45相当のパラディン+魔剣士+賢者+僧侶（4人、それぞれ上級職の
 * 最終技まで習得済み）で実測:
 *
 * - 素朴な並び（各人が使える中でpowerが最大の技を機械的に撃ち続ける）:
 *   1回目の終焉の波動(4ターン目)で守りの詠唱を誰も使っていないため、
 *   魔剣士が即死する。残り3人でもなお削り切れず、8ターンでタイムアウトする。
 * - 想定解（僧侶が1・5ターン目に守りの詠唱を挟み、残りのターンは全員が
 *   最大火力で殴る）: 誰も落ちずに8ターン目で撃破する。
 *
 * 行動表は通常([断ち割り,断ち割り,力を溜める,終焉の波動]の4マス)と、
 * HP15%を切ったあとの激昂([憤怒の乱舞,断ち割り])の二段。両方を読んで
 * 組む必要がある、という設計書の要求を満たす。
 */
const ABYSSAL_SOVEREIGN: Enemy = {
  id: 'arenaAbyssalSovereign', name: '深淵の覇王',
  stats: { maxHp: 16800, maxMp: 0, atk: 200, def: 80, mat: 300, mdf: 80, spd: 30 },
  skills: [
    atk('sovereignSlash', '断ち割り', 90),
    {
      id: 'sovereignCharge', name: '力を溜める', mpCost: 0, cooldown: 0, element: 'none', target: 'self',
      effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.3, turns: 1 } }],
    },
    {
      id: 'sovereignFinisher', name: '終焉の波動', mpCost: 0, cooldown: 0, element: 'dark', target: 'allEnemies',
      damage: { kind: 'magical', power: 1250 },
    },
    atk('sovereignFury', '憤怒の乱舞', 150),
  ],
  pattern: [
    { skillId: 'sovereignSlash' },
    { skillId: 'sovereignSlash' },
    { skillId: 'sovereignCharge' },
    { skillId: 'sovereignFinisher' },
  ],
  enrage: { hpRate: 0.15, pattern: [{ skillId: 'sovereignFury' }, { skillId: 'sovereignSlash' }] },
};

// ============================================================
// 階の一覧と報酬
// ============================================================

export type ArenaFloor = {
  readonly floor: number;
  readonly enemy: Enemy;
  /** その階を初めて倒したときだけ入る報酬（設計書§7）。 */
  readonly reward: BattleReward;
};

/**
 * 報酬は「本編の同レベル帯より少し多い」程度に留める（設計書§7）。
 * `battleRewards.ts` の雑魚敵は adventureExpToNext に対して7.2〜11%、
 * recruitCostに対して11.5〜13.8%という比率で決まっている。ここではその
 * 比率に+1.5ポイントした値を使い、「本編を飛ばして闘技場で育てるのが
 * 最適」にならない範囲で少しだけ上に置いた。
 */
export const ARENA_FLOORS: readonly ArenaFloor[] = [
  { floor: 1, enemy: ASPIRANT, reward: { gold: 50, exp: 70 } },
  { floor: 2, enemy: HOWLER, reward: { gold: 65, exp: 110 } },
  { floor: 3, enemy: SHACKLER, reward: { gold: 80, exp: 160 } },
  { floor: 4, enemy: IRONHIDE, reward: { gold: 95, exp: 225 } },
  { floor: 5, enemy: FROSTBACK, reward: { gold: 125, exp: 375 } },
  { floor: 6, enemy: TWOFACED, reward: { gold: 160, exp: 565 } },
  { floor: 7, enemy: JUGGERNAUT, reward: { gold: 190, exp: 780 } },
  { floor: 8, enemy: STORMCALLER, reward: { gold: 225, exp: 1045 } },
  { floor: 9, enemy: WEBSPINNER, reward: { gold: 260, exp: 1350 } },
  { floor: 10, enemy: BASTION, reward: { gold: 290, exp: 1690 } },
  { floor: 11, enemy: CINDERLORD, reward: { gold: 315, exp: 1885 } },
  { floor: 12, enemy: DIREWOLF_KING, reward: { gold: 335, exp: 2090 } },
  { floor: 13, enemy: WARBRINGER, reward: { gold: 390, exp: 2525 } },
  { floor: 14, enemy: TIDECALLER, reward: { gold: 440, exp: 3005 } },
  { floor: 15, enemy: TIME_THIEF, reward: { gold: 475, exp: 3530 } },
  { floor: 16, enemy: AEGIS_TITAN, reward: { gold: 515, exp: 4090 } },
  { floor: 17, enemy: VOID_PRIESTESS, reward: { gold: 550, exp: 4700 } },
  { floor: 18, enemy: DUSK_KNIGHT, reward: { gold: 590, exp: 5345 } },
  { floor: 19, enemy: ARCH_TYRANT, reward: { gold: 645, exp: 6395 } },
  // 裏ボス。報酬は金貨・経験値に加えて「倒したという記録そのもの」が乗るが、
  // その記録(arena_first)はサーバ側のデータモデル(設計書§4)の責務であり、
  // packages/core が持つのは戦闘に使う数値だけ。
  { floor: 20, enemy: ABYSSAL_SOVEREIGN, reward: { gold: 825, exp: 10570 } },
] as const;

/** その階の定義。存在しない階番号なら null。 */
export function arenaFloor(floor: number): ArenaFloor | null {
  return ARENA_FLOORS.find((f) => f.floor === floor) ?? null;
}

/** 裏ボスの階番号。19階までを倒した人だけがここに挑める（判定はサーバ側）。 */
export const ARENA_FINAL_FLOOR = 20;
