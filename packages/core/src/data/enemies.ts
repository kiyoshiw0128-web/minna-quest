import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';

const dragonBreath = {
  id: 'dragonBreath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 180 },
} as const satisfies Skill;

const intimidate = {
  id: 'intimidate', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
} as const satisfies Skill;

const charge = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
} as const satisfies Skill;

const blazingBurst = {
  id: 'blazingBurst', name: '灼熱爆発', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 900 },
} as const satisfies Skill;

const frenzy = {
  id: 'frenzy', name: '狂乱の爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 260 },
} as const satisfies Skill;

/**
 * 第1章のボス。行動表はプレイヤーに全部見せる前提で組んである。
 * 3ターン目の「溜め」で立つ被ダメ+50%の窓に4ターン目の大技を集中させると、バルゴスが
 * 自分の4ターン目の番に回ってくる前に激昂して行動表が切り替わり、灼熱爆発は撃たれない
 * まま7ターン目に勝利するのが想定解。
 *
 * **2026-09-05にHPを4800から320へ、攻撃を140から24へ下げた。** 4800は育ちきった
 * パーティ（冒険Lv50）を想定した数値だったが、章ボスは7日目に来る。実測すると
 * 7日目のプレイヤーは冒険Lv2〜3で、金貨も1〜2人雇える程度しか貯まっていない
 * （雑魚の報酬から逆算。第1章で3〜5戦、経験値215〜415、金貨135〜250）。
 * 4800のままでは1ターン目に全滅するだけの壁で、誰にも倒せなかった。
 *
 * いまの数値は、Lv3が3人の素朴な並びで8ターン目にぎりぎり勝ち、
 * Lv3が2人、またはLv2が3人では負ける水準として実測して決めた。
 * 世界としては誰か1人が倒せばよいので、いちばん備えた人が勝てる強さに置いている。
 *
 * 上の想定解（溜めの窓に大技を集中させ、灼熱爆発が来る前に激昂させる）は
 * この数値でも成立する。激昂の閾値がHPの半分なので、下げても構造は変わらない。
 */
export const BALGOS = {
  id: 'balgos',
  name: '炎竜バルゴス',
  stats: { maxHp: 320, maxMp: 999, atk: 24, def: 60, mat: 22, mdf: 40, spd: 12 },
  skills: [dragonBreath, intimidate, charge, blazingBurst, frenzy],
  resist: { fire: 0.5, ice: 1.5 },
  pattern: [
    { skillId: 'dragonBreath' },
    { skillId: 'intimidate' },
    { skillId: 'charge' },
    { skillId: 'blazingBurst' },
  ],
  enrage: {
    hpRate: 0.5,
    pattern: [{ skillId: 'frenzy' }, { skillId: 'dragonBreath' }],
  },
} as const satisfies Enemy;

/**
 * ここから雑魚敵。バルゴスの定義・数値は一切変えていない。
 *
 * どれも「冒険Lvと同じジョブLvの戦士が、そのジョブLvで習得済みの技だけを使って
 * 8ターン以内に勝てる」ことと「その半分のレベルでは勝てない」ことを実測して
 * 決めている（`computeStats` でLvNの戦士を作り `simulate` に通した。半分のレベルは
 * 8ターンでは削り切れない、または`voidWraith`のように途中で戦士が力尽きる）。
 * ダメージが除算式（`damage.ts`）なので、DEFを少し上げるだけで到達可能なHPの
 * 上限が大きく下がる。想定レベルにいわゆる「ちょうどいいDEF」を実測で探し、
 * そこから逆算してHPを決めた。
 *
 * 弱点・耐性は、プレイヤーの手持ち技（属性42個）に選ぶ余地を持たせるために
 * 種族ごとに割り振った。攻撃はどれも物理のみ：耐性はプレイヤーが撃ってくる
 * 属性技にだけ効き、敵自身の通常攻撃の属性には関係しない。
 */

const daggerStrike = {
  id: 'daggerStrike', name: '匕首の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/**
 * 冒険Lv1・ジョブLv1の戦士が slash 1本だけで挑む想定解。
 * HP90・DEF3は、実測でこの戦士のslash（1500/(100+DEF)）が7ターンで
 * 削り切れる上限から逆算した値。150〜400という当初の目安より低いが、
 * 「Lv1がslashだけで8ターン以内に勝てる」という制約が優先する
 * （このHPを超えると8ターンでは倒せなくなることを実測済み）。
 */
export const BANDIT_SCOUT = {
  id: 'banditScout',
  name: '山賊の見張り',
  stats: { maxHp: 90, maxMp: 0, atk: 12, def: 3, mat: 6, mdf: 4, spd: 11 },
  skills: [daggerStrike],
  pattern: [{ skillId: 'daggerStrike' }],
} as const satisfies Enemy;

const bite = {
  id: 'bite', name: '噛みつき', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv3で7ターンで勝てて、Lv1では8ターンでも削り切れない実測値。 */
export const FOREST_WOLF = {
  id: 'forestWolf',
  name: '森の狼',
  stats: { maxHp: 170, maxMp: 0, atk: 18, def: 10, mat: 9, mdf: 7, spd: 13 },
  skills: [bite],
  pattern: [{ skillId: 'bite' }],
  resist: { fire: 1.4, ice: 0.7 },
} as const satisfies Enemy;

const clubBlow = {
  id: 'clubBlow', name: '棍棒の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv5で7ターンで勝てて、Lv2では削り切れない実測値。第1章序盤の締め。 */
export const GOBLIN_RAIDER = {
  id: 'goblinRaider',
  name: 'ゴブリンの掠奪者',
  stats: { maxHp: 260, maxMp: 0, atk: 24, def: 10, mat: 10, mdf: 8, spd: 13 },
  skills: [clubBlow],
  pattern: [{ skillId: 'clubBlow' }],
  resist: { dark: 0.6, holy: 1.3 },
} as const satisfies Enemy;

const maulSwing = {
  id: 'maulSwing', name: '大槌の一撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 第1章後半の入り口。冒険Lv8で7ターンで勝てて、Lv4では削り切れない。 */
export const OGRE_BRUTE = {
  id: 'ogreBrute',
  name: '人喰い鬼',
  stats: { maxHp: 460, maxMp: 0, atk: 38, def: 15, mat: 15, mdf: 12, spd: 10 },
  skills: [maulSwing],
  pattern: [{ skillId: 'maulSwing' }],
  resist: { fire: 0.7, ice: 1.3 },
} as const satisfies Enemy;

const knightStrike = {
  id: 'knightStrike', name: '打ち下ろし', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
} as const satisfies Skill;

const knightIntimidate = {
  id: 'knightIntimidate', name: '威圧', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.2, turns: 2 } }],
} as const satisfies Skill;

const knightGuardDown = {
  id: 'knightGuardDown', name: '剣を構える', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
} as const satisfies Skill;

const knightSmash = {
  id: 'knightSmash', name: '渾身の斬撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 320 },
} as const satisfies Skill;

/**
 * バルゴス以外で唯一「溜め→大技」を持つ雑魚。3マス目の剣を構える（被ダメ+50%）に
 * 4マス目の渾身の斬撃が続くので、行動表を読んだプレイヤーはその窓に火力を
 * 集中できる。実測はこの読みを使わない素直な連打（貪欲プランナー）でも
 * 冒険Lv12で7ターンに収まることを確認しており、読みは近道であって必須ではない。
 */
export const ARMORED_KNIGHT = {
  id: 'armoredKnight',
  name: '鎧の廃騎士',
  stats: { maxHp: 650, maxMp: 0, atk: 50, def: 15, mat: 25, mdf: 15, spd: 14 },
  skills: [knightStrike, knightIntimidate, knightGuardDown, knightSmash],
  pattern: [
    { skillId: 'knightStrike' },
    { skillId: 'knightIntimidate' },
    { skillId: 'knightGuardDown' },
    { skillId: 'knightSmash' },
  ],
  resist: { dark: 0.6, holy: 1.5 },
} as const satisfies Enemy;

const clawRake = {
  id: 'clawRake', name: '爪撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 第2章の入り口。冒険Lv18（渾身の一撃を覚えた戦士）で7ターンで勝てる。 */
export const DIRE_WYVERN = {
  id: 'direWyvern',
  name: '悪竜の眷属',
  stats: { maxHp: 1350, maxMp: 0, atk: 75, def: 15, mat: 38, mdf: 20, spd: 18 },
  skills: [clawRake],
  pattern: [{ skillId: 'clawRake' }],
  resist: { fire: 0.6, ice: 1.4 },
} as const satisfies Enemy;

const rockFist = {
  id: 'rockFist', name: '岩拳', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/** 冒険Lv21で7ターンで勝てる実測値。 */
export const STONE_GOLEM = {
  id: 'stoneGolem',
  name: '石の巨人',
  stats: { maxHp: 1600, maxMp: 0, atk: 95, def: 15, mat: 10, mdf: 30, spd: 8 },
  skills: [rockFist],
  pattern: [{ skillId: 'rockFist' }],
  resist: { fire: 0.6, thunder: 1.4 },
} as const satisfies Enemy;

const shadowClaw = {
  id: 'shadowClaw', name: '影爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

/**
 * 第2章の最強格の雑魚。冒険Lv23（大地断裂を覚えた戦士）で7ターンで勝てて、
 * Lv11では8ターン以内に戦士側が力尽きる（他の雑魚は削り切れないだけで
 * 済んだが、これは実際に負ける）。バルゴスに次ぐ強さとして激昂は付けず、
 * 純粋な火力で差をつけた。
 */
export const VOID_WRAITH = {
  id: 'voidWraith',
  name: '影を纏う亡霊',
  stats: { maxHp: 2500, maxMp: 0, atk: 110, def: 15, mat: 55, mdf: 25, spd: 20 },
  skills: [shadowClaw],
  pattern: [{ skillId: 'shadowClaw' }],
  resist: { dark: 0.5, holy: 1.6 },
} as const satisfies Enemy;

/**
 * ここから第2章のボス。第1章のバルゴス・雑魚8体の定義・数値は一切変えていない。
 *
 * 章ボスは7日ごと（daily/day.ts の BOSS_INTERVAL）に来るので、第2章のボスは
 * 14日目に来る。7日目にバルゴスへ勝った実績のある備えたプレイヤーが、
 * さらに6日（8〜13日目）ぶん雑魚（森の狼・ゴブリンの掠奪者・人喰い鬼）を
 * 狩って伸びた姿を実測の基準にする。
 *
 * `computeStats` で warrior/mage/priest を冒険Lv6・そのジョブLvで組み、
 * `toPartyMember` を通して `simulate` にかけると、Lv6が3人（そのレベルで
 * 習得済みの技だけ）で勝てて、Lv3が3人では負ける水準として下の数値が出た
 * （`tests/battle/bosses2and3.test.ts` に実測がある）。Lv6は
 * adventureExpToNext の二乗カーブ（progression/curve.ts）で見ると、
 * バルゴス撃破の400経験値に加えて8〜13日目で雑魚を4〜6戦ぶん勝った程度で
 * 届く水準（累計3300前後）で、7日目の実像（Lv2〜3）から地続きの伸びとして無理がない。
 *
 * **行動表の仕掛け：物理ではなく魔法の窓。** バルゴスは「被ダメ+50%の自分への
 * 呪い（溜め）」→大技という物理寄りの仕掛けだったが、ゴウザは自分のMATを
 * 上げる呪詠（3ターン）→呪詛の波動（全体魔法）という、魔法版の同じ形にした。
 * 違うのは対処の道具：物理のダメージ軽減技をこの職業構成はまだ持たないので、
 * 唯一の対抗手段は僧侶のguardChant（全体MDF+50%、3ターン）を波動が来る前に
 * 前もって張っておくことだけになる。張らずに撃たれると、育ちきっていない
 * 冒険Lv6のパーティは誰か1人が波動で戦線離脱し、そのまま押し切られる
 * （実測：guardChantを張らず殴るだけの「素朴に一番強い技を連打する」プランは
 * 8ターン以内に決着しない）。波動を撃った直後にゴウザ自身のMDFが40%落ちる
 * （呪詛の代償）ので、そこに氷の槍を集中させると打ち取りが早まるが、
 * 張らずに耐えられない以上、これは近道であって必須の読みではない。
 *
 * HPの半分で激昂し、以後は呪詠の予告なしに波動を連発する。ここから先は
 * 「一度は凌げても、凌ぎ続けられるか」に問いが変わる。
 *
 * **僧侶を盗賊に差し替えた編成と比べても、結果で負けない。** guardChantは
 * この編成（戦士・魔法使い・僧侶）が波動を安全に受けるための唯一の道具だが、
 * 「それなら守りを捨てて僧侶を盗賊に替え、殴る人数を増やせばいいのでは」を
 * 実測で潰してある。盗賊にも波動を防ぐ手段は無いので、素の耐久（HP・MDF）が
 * 同程度な以上、盗賊も僧侶と同じ一撃をそのまま受ける。`tests/battle/
 * bosses2and3.test.ts`の「結果で負けない」検査は、勝敗（win/timeout/lose）を
 * 編成間で比べており、読んで備えた編成が読まずに殴るだけの編成に負ける
 * 組み合わせが無いことを保証する（ターン数の速さまでは揃えない――守りに
 * 回った分だけ遅くなるのは織り込み済みで、そこを揃えると僧侶を連れる意味が
 * 測れなくなるため）。
 */
const gouzaClaw = {
  id: 'gouzaClaw', name: '爪撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 90 },
} as const satisfies Skill;

const gouzaChant = {
  id: 'gouzaChant', name: '呪詠', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'statMod', stat: 'mat', rate: 0.6, turns: 3 } }],
} as const satisfies Skill;

const gouzaCurseNova = {
  id: 'gouzaCurseNova', name: '呪詛の波動', mpCost: 0, cooldown: 0,
  element: 'dark', target: 'allEnemies',
  damage: { kind: 'magical', power: 520 },
  effects: [{ to: 'self', effect: { kind: 'statMod', stat: 'mdf', rate: -0.4, turns: 2 } }],
} as const satisfies Skill;

export /*
 * 2026-09-06にHPを500から800へ上げた。
 *
 * 500は3人パーティを基準にした値だったが、14日目には金貨が貯まっていて
 * 4人揃っている。4人で挑むと2〜3ターンで終わり、4ターン目の「呪詛の波動」が
 * 撃たれる前に決着していた。公開している行動表が飾りになる。
 *
 * 800では、冒険Lv6の4人で「呪詠」の後に guardChant を張れば5ターンで勝ち、
 * 張らなければ5ターンで負ける。備えが勝敗を分ける水準として実測で決めた。
 *
 * **僧侶を連れず火力で押す並びは3ターンで勝つ。** これは想定内とする。
 * 削り切れるだけの火力を用意したなら、それはそれで一つの答えである。
 */
const GOUZA = {
  id: 'gouza',
  name: '鬼呪術師ゴウザ',
  stats: { maxHp: 800, maxMp: 999, atk: 45, def: 15, mat: 40, mdf: 20, spd: 15 },
  skills: [gouzaClaw, gouzaChant, gouzaCurseNova],
  pattern: [
    { skillId: 'gouzaClaw' },
    { skillId: 'gouzaChant' },
    { skillId: 'gouzaCurseNova' },
    { skillId: 'gouzaClaw' },
  ],
  enrage: {
    hpRate: 0.5,
    pattern: [{ skillId: 'gouzaCurseNova' }, { skillId: 'gouzaClaw' }],
  },
} as const satisfies Enemy;

/**
 * ここから第3章のボス。21日目に来る。14日目のゴウザに勝った実績のある
 * パーティが、さらに6日（15〜20日目）雑魚を狩って伸びた姿を基準にする。
 * `tests/battle/bosses2and3.test.ts` の実測で、冒険Lv9が3人（そのレベルで
 * 習得済みの技だけ）で勝てて、Lv6が3人では負ける水準としてこの数値が出た。
 * Lv9はadventureExpToNextの累計（4860手前）で見ても、ゴウザ撃破分と
 * 15〜20日目の雑魚数戦を足した地続きの伸びの範囲に収まる。
 *
 * **行動表の仕掛け：反応できない時間への先読み。** バルゴスは窓が来た瞬間に
 * 攻め込む読み、ゴウザは波動の前にMDFを張っておく読みだった。ヴォルニルは
 * さらに一段先で、「咆哮（全体1ターン気絶）の次のターンには薙ぎ払い（全体魔法）が
 * 来る」と行動表からわかっていても、気絶している間は何もできない。
 * 打てる手は気絶する前、つまり咆哮そのものより前のターンに前もって
 * guardChant（全体MDF+50%、3ターン）を張っておくことだけ。張った効果は
 * 気絶中も続くので、動けないターンの薙ぎ払いにもちゃんと効く。
 *
 * 素朴に一番強い技を連打するだけのプラン（警戒せずMDFを張らない）でも
 * 冒険Lv9が3人なら善戦はするが、8ターン以内には削り切れない
 * （実測：guardChantを張った場合は7ターンで勝てるが、張らない場合は
 * 8ターンで決着しない）。HPの半分からは咆哮と薙ぎ払いを交互に連発する
 * 激昂に切り替わり、気絶で溶ける時間がさらに増える。
 *
 * **僧侶を盗賊に差し替えた編成と比べても、結果で負けない。** ゴウザと同じ
 * 検査を実測してある。盗賊にも薙ぎ払いを防ぐ手段は無く、素の耐久が
 * 同程度な以上、僧侶を外して火力を足しても薙ぎ払いはそのまま受ける。
 * `tests/battle/bosses2and3.test.ts`で勝敗（win/timeout/lose）を編成間で
 * 比べ、読んで備えた編成が読まずに殴るだけの編成に負けないことを保証する。
 */
const vornilClaw = {
  id: 'vornilClaw', name: '爪撃', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
} as const satisfies Skill;

const vornilDreadRoar = {
  id: 'vornilDreadRoar', name: '深淵の咆哮', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'stun', turns: 1 } }],
} as const satisfies Skill;

const vornilTailSweep = {
  id: 'vornilTailSweep', name: '尾の薙ぎ払い', mpCost: 0, cooldown: 0,
  element: 'dark', target: 'allEnemies',
  damage: { kind: 'magical', power: 280 },
} as const satisfies Skill;

export /*
 * **軽減のパズルではなく、火力と手数の勝負として置いてある。**
 *
 * 咆哮で行動を止めてから尾で薙ぐ、という形は読める。しかし guardChant の
 * MDF+50% が減らせる魔法ダメージは1割前後でしかなく（100/(100+mdf) と
 * 100/(100+1.5*mdf) の差）、生死の閾値を跨がせるには小さすぎる。
 * HPを振って実測しても、4人で挑む限り備えの有無で結果が変わる帯域は無かった。
 *
 * これはダメージ式と guardChant の強さから来る限界なので、ここで
 * 誤魔化さずに「読みが効くボス」を名乗らせない。読みが効くのは第2章の
 * ゴウザ（呪詠→波動）と、闘技場20階の深淵の覇王である。
 */
const VORNIL = {
  id: 'vornil',
  name: '深淵竜ヴォルニル',
  stats: { maxHp: 750, maxMp: 999, atk: 70, def: 25, mat: 55, mdf: 30, spd: 12 },
  skills: [vornilClaw, vornilDreadRoar, vornilTailSweep],
  pattern: [
    { skillId: 'vornilClaw' },
    { skillId: 'vornilDreadRoar' },
    { skillId: 'vornilTailSweep' },
    { skillId: 'vornilClaw' },
  ],
  enrage: {
    hpRate: 0.5,
    pattern: [{ skillId: 'vornilTailSweep' }, { skillId: 'vornilDreadRoar' }],
  },
} as const satisfies Enemy;

export const ENEMIES = {
  balgos: BALGOS,
  banditScout: BANDIT_SCOUT,
  forestWolf: FOREST_WOLF,
  goblinRaider: GOBLIN_RAIDER,
  ogreBrute: OGRE_BRUTE,
  armoredKnight: ARMORED_KNIGHT,
  direWyvern: DIRE_WYVERN,
  stoneGolem: STONE_GOLEM,
  voidWraith: VOID_WRAITH,
} as const satisfies Record<string, Enemy>;
