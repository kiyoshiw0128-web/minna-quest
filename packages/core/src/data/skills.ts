import type { Skill } from '../battle/skill.js';

/** 技のマスタ。バランス調整はここの数値をいじる。 */
export const SKILLS = {
  slash: {
    id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 100 },
  },
  heavyBlow: {
    id: 'heavyBlow', name: '渾身の一撃', mpCost: 14, cooldown: 3,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 320 },
  },
  armorBreak: {
    id: 'armorBreak', name: '鎧砕き', mpCost: 10, cooldown: 4,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 80, pierce: 0.5 },
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'def', rate: -0.4, turns: 3 } }],
  },
  iceLance: {
    id: 'iceLance', name: '氷の槍', mpCost: 12, cooldown: 0,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 180 },
  },
  blizzard: {
    id: 'blizzard', name: '氷嵐', mpCost: 24, cooldown: 3,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 380 },
  },
  holyLight: {
    id: 'holyLight', name: '癒やしの光', mpCost: 9, cooldown: 0,
    element: 'holy', target: 'lowestHpAlly',
    heal: 160,
  },
  guardChant: {
    id: 'guardChant', name: '守りの詠唱', mpCost: 8, cooldown: 4,
    element: 'holy', target: 'allAllies',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } }],
  },
  poisonDagger: {
    id: 'poisonDagger', name: '毒短剣', mpCost: 6, cooldown: 2,
    element: 'dark', target: 'enemy',
    damage: { kind: 'fixed', amount: 120 },
  },
  /**
   * 本来の挑発は「敵の狙いを自分に引きつける」効果だが、段階1の狙い先は
   * HP割合で決まる仕組みで、それを変えるのは戦闘エンジンへの変更になる。
   * ここでは仕様書4.2が名前を挙げている技として、engine が今支えられる
   * 「身を晒して守りを固める」自己バフとして実装する。引きつけ効果は段階4以降に送る。
   */
  provoke: {
    id: 'provoke', name: '挑発', mpCost: 6, cooldown: 3,
    element: 'none', target: 'self',
    effects: [
      { to: 'self', effect: { kind: 'statMod', stat: 'def', rate: 0.5, turns: 3 } },
      { to: 'self', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } },
    ],
  },
  focus: {
    id: 'focus', name: '精神統一', mpCost: 8, cooldown: 4,
    element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'statMod', stat: 'atk', rate: 0.5, turns: 3 } }],
  },
  flameArrow: {
    id: 'flameArrow', name: '火炎の矢', mpCost: 8, cooldown: 0,
    element: 'fire', target: 'enemy',
    damage: { kind: 'magical', power: 140 },
  },
  snipe: {
    id: 'snipe', name: '狙撃', mpCost: 10, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 200, pierce: 0.3 },
  },
  holyBlade: {
    id: 'holyBlade', name: '聖剣', mpCost: 14, cooldown: 2,
    element: 'holy', target: 'enemy',
    damage: { kind: 'physical', power: 240, pierce: 0.25 },
  },
  meteor: {
    id: 'meteor', name: 'メテオ', mpCost: 30, cooldown: 5,
    element: 'fire', target: 'allEnemies',
    damage: { kind: 'magical', power: 500 },
  },

  // ここから追加分。既存14技の数値・IDは変えていない。

  /**
   * 戦士の「固めて殴る」を体現する技。DEF は ATK ほど伸びない
   * （GROWTH_PER_LEVEL: atk4 / def3、冒険Lv20・C素質・ジョブLv20で
   * 戦士はatk148・def107）ので、同じpowerでは通常の物理技に劣る。
   * power210は、defで殴っても armorBreak（power80・pierce0.5）より
   * 明確に強くなる水準として実測して決めた。
   */
  shieldSmash: {
    id: 'shieldSmash', name: '盾撃', mpCost: 8, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 210, scale: 'def' },
  },
  /** 全体攻撃の上限運用（meteorと同じMP30・CD5）に合わせた戦士の切り札。 */
  earthRend: {
    id: 'earthRend', name: '大地断裂', mpCost: 30, cooldown: 5,
    element: 'none', target: 'allEnemies',
    damage: { kind: 'physical', power: 500 },
  },
  risingFist: {
    id: 'risingFist', name: '昇龍拳', mpCost: 7, cooldown: 1,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 150 },
  },
  spiritEdge: {
    id: 'spiritEdge', name: '幻影拳', mpCost: 11, cooldown: 1,
    element: 'dark', target: 'enemy',
    damage: { kind: 'physical', power: 190 },
  },
  /**
   * 武闘家のSPD技1本。SPDは全能力中もっとも成長が遅く（1.2/Lv、ATKは4/Lv）、
   * 武闘家のstatBonusもspd1しか乗らない。ATK技と同じ power では、MPを払う技が
   * 無消費のslashに負ける。実測（冒険Lv20・C素質・ジョブLv20・相手DEF60）で
   * power300では97、slashは105と逆転していた。
   *
   * power420まで積むと、C素質でも136とslashを明確に上回り、SPDに素質を
   * 振ったキャラでは154まで伸びる。SPD技の power がATK技の3倍を超えるのは、
   * 能力そのものの伸びの差をここで埋めているため。
   */
  galeKick: {
    id: 'galeKick', name: '疾風脚', mpCost: 12, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 420, scale: 'spd' },
  },
  manaBolt: {
    id: 'manaBolt', name: '魔弾', mpCost: 9, cooldown: 0,
    element: 'none', target: 'enemy',
    damage: { kind: 'magical', power: 150 },
  },
  thunderBolt: {
    id: 'thunderBolt', name: '雷撃', mpCost: 10, cooldown: 0,
    element: 'thunder', target: 'enemy',
    damage: { kind: 'magical', power: 170 },
  },
  iceCoffin: {
    id: 'iceCoffin', name: '氷の棺', mpCost: 17, cooldown: 2,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 270 },
  },
  thunderStorm: {
    id: 'thunderStorm', name: '雷雲', mpCost: 23, cooldown: 3,
    element: 'thunder', target: 'enemy',
    damage: { kind: 'magical', power: 370 },
  },
  /**
   * 僧侶の主軸技。healScaleをmdfにすることで、僧侶のstatBonus（mdf3 mat2）
   * がそのまま回復量の伸びになる。holyLight（既定のmat基準）より
   * 僧侶にとって素直に強くなるのが狙い。
   */
  prayerOfMercy: {
    id: 'prayerOfMercy', name: '女神の祈り', mpCost: 12, cooldown: 1,
    element: 'holy', target: 'lowestHpAlly',
    heal: 200, healScale: 'mdf',
  },
  sacredFlame: {
    id: 'sacredFlame', name: '聖なる炎', mpCost: 10, cooldown: 0,
    element: 'holy', target: 'enemy',
    damage: { kind: 'magical', power: 170 },
  },
  /** 全体回復。1人あたりの回復量をprayerOfMercyより落とし、MP・CDで頻用を防ぐ。 */
  groupHeal: {
    id: 'groupHeal', name: '癒しの波動', mpCost: 16, cooldown: 3,
    element: 'holy', target: 'allAllies',
    heal: 120, healScale: 'mdf',
  },
  holyNova: {
    id: 'holyNova', name: '聖なる波動', mpCost: 28, cooldown: 5,
    element: 'holy', target: 'allEnemies',
    damage: { kind: 'magical', power: 480 },
  },
  /**
   * 盗賊の主軸技。冒険Lv20・C素質・ジョブLv20で盗賊はatk128・spd72
   * （ジョブ補正がatk2 spd2で拮抗するぶん差は縮むが、素質をSPDに振った
   * プレイヤーではもっと開く）。SPD特化の攻撃側で試すと、power100の
   * 通常攻撃よりこの技の方が明確に上回ることを masterData 側のテストで確認する。
   */
  swiftStrike: {
    id: 'swiftStrike', name: '疾風の一撃', mpCost: 10, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 270, scale: 'spd' },
  },
  /** 小威力+SPDデバフ。armorBreak（DEFデバフ）と対になる盗賊のデバフ技。 */
  legSweep: {
    id: 'legSweep', name: '足払い', mpCost: 8, cooldown: 3,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 80 },
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'spd', rate: -0.4, turns: 3 } }],
  },
  /** 割合ダメージ。防御力を無視して「貫通」する盗賊の切り札。capは必須。 */
  shadowExecute: {
    id: 'shadowExecute', name: '暗殺の一閃', mpCost: 14, cooldown: 3,
    element: 'dark', target: 'enemy',
    damage: { kind: 'ratio', percent: 20, cap: 300 },
  },
  hawkEye: {
    id: 'hawkEye', name: '鷹の目', mpCost: 6, cooldown: 1,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 140 },
  },
  /**
   * 狩人のSPD物理。snipe（MP10・CD2・power200・pierce0.3）と選ばせる技なので、
   * 同じ MP と CD で power だけ上げると、ATK型では常にsnipeが上、SPD型では
   * 常にこちらが上という、素質で答えが決まる死んだ選択になる。
   *
   * MP8・CD1と軽くして、1発の威力ではsnipeにやや劣るが倍の頻度で撃てる技に
   * してある。実測（冒険Lv20・C素質・ジョブLv20・相手DEF60）で、C素質では
   * 162対snipe180、SPDに振ると177対163と逆転する。撃つ回数を含めれば
   * どちらの素質でも選ぶ理由がある。
   */
  windArrow: {
    id: 'windArrow', name: '疾風の矢', mpCost: 8, cooldown: 1,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 360, scale: 'spd' },
  },
  thunderArrow: {
    id: 'thunderArrow', name: '雷の矢', mpCost: 9, cooldown: 0,
    element: 'thunder', target: 'enemy',
    damage: { kind: 'magical', power: 150 },
  },
  /** 割合ダメージ。狩人のもう一つの切り札。cap必須。 */
  vitalShot: {
    id: 'vitalShot', name: '急所撃ち', mpCost: 16, cooldown: 4,
    element: 'none', target: 'enemy',
    damage: { kind: 'ratio', percent: 25, cap: 400 },
  },
  vowOfProtection: {
    id: 'vowOfProtection', name: '守護の誓い', mpCost: 10, cooldown: 4,
    element: 'holy', target: 'allAllies',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'def', rate: 0.4, turns: 3 } }],
  },
  /**
   * パラディンの主軸技その2（shieldSmashと共有）。DEFはATKに次いで
   * 成長が大きい（3/Lv）ので、SPD技ほど極端な倍率は要らない。
   * 冒険Lv20・C素質・ジョブLv20でパラディンはatk148・def147とほぼ並ぶため、
   * power260はholyBlade（power240・pierce0.25）と同程度の出力になるよう
   * 実測して決めた。
   */
  judgmentShield: {
    id: 'judgmentShield', name: '裁きの盾', mpCost: 12, cooldown: 2,
    element: 'holy', target: 'enemy',
    damage: { kind: 'physical', power: 260, scale: 'def' },
  },
  iceShard: {
    id: 'iceShard', name: '氷片', mpCost: 7, cooldown: 0,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 130 },
  },
  flameEdge: {
    id: 'flameEdge', name: '火焔の剣', mpCost: 10, cooldown: 1,
    element: 'fire', target: 'enemy',
    damage: { kind: 'physical', power: 180 },
  },
  thunderEdge: {
    id: 'thunderEdge', name: '雷刃', mpCost: 10, cooldown: 1,
    element: 'thunder', target: 'enemy',
    damage: { kind: 'physical', power: 180 },
  },
  curseBolt: {
    id: 'curseBolt', name: '呪縛の矢', mpCost: 10, cooldown: 3,
    element: 'dark', target: 'enemy',
    damage: { kind: 'magical', power: 160 },
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
  },
  /** 賢者の支援技。healScaleをmdfにして、賢者のstatBonus mdf3を活かす。 */
  sagesWisdom: {
    id: 'sagesWisdom', name: '賢者の福音', mpCost: 13, cooldown: 1,
    element: 'holy', target: 'lowestHpAlly',
    heal: 190, healScale: 'mdf',
  },
  iceCrystal: {
    id: 'iceCrystal', name: '深奥氷刃', mpCost: 20, cooldown: 2,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 300 },
  },
} as const satisfies Record<string, Skill>;
