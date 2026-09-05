import type { DailyEvent } from '../daily/event.js';

/**
 * イベントのプール。条件を満たすものからその日のシードで3つ引かれる。
 * どの章でも最低5つは候補が残るように組んである（健全性テストが番人）。
 *
 * **この表は追記のみ。エントリを消してはならず、並べ替えてもならない。**
 * その日の抽選は、条件を満たしたイベントの並びに対する「位置」を引く。
 * 途中に差し込む、消す、順番を入れ替える、のいずれをやっても、
 * 過去の日を後から引き直したときの3択が変わってしまう。
 * 「なぜこの選択肢が出たか」を誰でも再現できる、という約束が崩れる。
 * 出さなくなったイベントは、消すのではなく条件で閉じること。
 *
 * **IDに整数に見える文字列を使わないこと。** 票数は選択肢IDをキーにした
 * オブジェクトで持つが、整数に見えるキーはオブジェクト内で昇順に並び替わる。
 * 締めたときの並びと、あとから引き直したときの並びが食い違う。
 *
 * 雑魚敵を足したので、banditAmbush と scoutTheRidge が指す敵を炎竜バルゴスから
 * 適切な雑魚に差し替えてある。まだ戦闘が確定した日を持つ世界が存在しないため、
 * enemyId の差し替え（並びの変更ではない）はこの時点が最も安全。
 *
 * **戦闘イベントの章の条件は、その敵に勝てるレベルから逆算している。**
 * 経験値は戦闘に勝ってしか入らず、1日1戦なので、レベルはおおよそ日数に比例する。
 * 章は7日で1つ進むので、第N章の頭でだいたい 7×(N-1) 戦ぶんのレベルになる。
 * 敵の必要レベル（mobs.test.ts が実測している）をこの目安に当てはめて章を決めた。
 * 目安より強い敵を早い章に置くと、勝てない戦いが並ぶだけになる。
 * 実際、追加した直後は人喰い鬼（必要Lv8）が第1章に出るようになっていた。
 *
 * **2026-09-05に非戦闘イベントを29件追記し、タグで枝分かれする本線を4本作った
 * （山賊、森の精霊、遺跡の生存者、呪い）。** 各本線は「二択の分岐」→「選ばなかった
 * 側を forbidsTags で閉じる」→「選んだ側だけに後日イベントが requiresTags で
 * 開く」の形で組んである。分岐の入口イベントは自分自身の付与タグも forbidsTags に
 * 含めており、これは「選んだ後にまた同じ入口が出る」のを防ぐため（一度きりの
 * 出来事にする既存パターン＝meetElder / strayPuppy と同じ考え方）。
 * 戦闘イベントは敵が8体しかおらず追加していない（新しい敵は作らない方針）。
 */
export const EVENTS = {
  crossroads: {
    id: 'crossroads', name: '分かれ道', kind: 'story',
    outcome: { gold: 30 },
    condition: {},
  },
  restAtSpring: {
    id: 'restAtSpring', name: '泉で休む', kind: 'story',
    outcome: { gold: 10 },
    condition: {},
  },
  banditAmbush: {
    id: 'banditAmbush', name: '山賊の待ち伏せ', kind: 'battle',
    enemyId: 'banditScout',
    condition: {},
  },
  meetElder: {
    id: 'meetElder', name: '村の長老に会う', kind: 'story',
    outcome: { gold: 20, addTags: ['met-elder'] },
    condition: { forbidsTags: ['met-elder'] },
  },
  elderTale: {
    id: 'elderTale', name: '長老の昔語り', kind: 'story',
    outcome: { gold: 50 },
    condition: { requiresTags: ['met-elder'] },
  },
  strayPuppy: {
    id: 'strayPuppy', name: '迷い犬', kind: 'story',
    outcome: { petId: 'puppy', addTags: ['has-pet'] },
    condition: { forbidsTags: ['has-pet'] },
  },
  merchantCaravan: {
    id: 'merchantCaravan', name: '隊商との交渉', kind: 'story',
    outcome: { gold: 120 },
    condition: { minChapter: 2 },
  },
  burnedVillage: {
    id: 'burnedVillage', name: '焼けた村', kind: 'story',
    outcome: { gold: 40, addTags: ['saw-ruins'] },
    condition: { minChapter: 2 },
  },
  dragonTracks: {
    id: 'dragonTracks', name: '竜の足跡', kind: 'story',
    outcome: { gold: 60 },
    condition: { minChapter: 2, requiresTags: ['saw-ruins'] },
  },
  scoutTheRidge: {
    id: 'scoutTheRidge', name: '尾根を偵察する', kind: 'battle',
    enemyId: 'armoredKnight',
    condition: { minChapter: 3 },
  },

  // ここから追記分。既存10エントリは並び・内容とも変えていない。

  forestWolfAttack: {
    id: 'forestWolfAttack', name: '森の狼に襲われる', kind: 'battle',
    enemyId: 'forestWolf',
    condition: {},
  },
  goblinCampRaid: {
    id: 'goblinCampRaid', name: 'ゴブリンの襲撃', kind: 'battle',
    enemyId: 'goblinRaider',
    condition: {},
  },
  ogreEncounter: {
    id: 'ogreEncounter', name: '人喰い鬼との遭遇', kind: 'battle',
    enemyId: 'ogreBrute',
    condition: { minChapter: 2 },
  },
  dragonlingClash: {
    id: 'dragonlingClash', name: '悪竜の眷属との激突', kind: 'battle',
    enemyId: 'direWyvern',
    condition: { minChapter: 4 },
  },
  stoneGolemBlockade: {
    id: 'stoneGolemBlockade', name: '石の巨人が道を塞ぐ', kind: 'battle',
    enemyId: 'stoneGolem',
    condition: { minChapter: 4 },
  },
  voidWraithAmbush: {
    id: 'voidWraithAmbush', name: '影の亡霊に囚われる', kind: 'battle',
    enemyId: 'voidWraith',
    condition: { minChapter: 5 },
  },

  // ここから非戦闘の追記分（2026-09-05）。既存16エントリは並び・内容とも変えていない。
  // 敵は増やさず（8体で足りている）、ルートを枝分かれさせる非戦闘イベントのみ足す。

  // --- 山賊の本線：取引するか、通報するか。片方を選ぶともう片方は二度と出ない。 ---
  banditDeal: {
    id: 'banditDeal', name: '山賊との密約', kind: 'story',
    outcome: { gold: 35, addTags: ['bandit-pact'] },
    condition: { forbidsTags: ['bandit-pact', 'guard-favor'] },
  },
  guardReport: {
    id: 'guardReport', name: '衛兵への通報', kind: 'story',
    outcome: { gold: 25, addTags: ['guard-favor'] },
    condition: { forbidsTags: ['bandit-pact', 'guard-favor'] },
  },
  banditHideoutInvite: {
    id: 'banditHideoutInvite', name: '山賊の隠れ家への招待', kind: 'story',
    outcome: { gold: 50, addTags: ['bandit-den'] },
    condition: { requiresTags: ['bandit-pact'], forbidsTags: ['bandit-den'] },
  },
  guardEscortQuest: {
    id: 'guardEscortQuest', name: '衛兵隊の護衛任務', kind: 'story',
    outcome: { gold: 45, addTags: ['guard-quest'] },
    condition: { requiresTags: ['guard-favor'], forbidsTags: ['guard-quest'] },
  },

  // --- 森の精霊の本線：祈るか、切り拓くか。 ---
  forestSpiritPray: {
    id: 'forestSpiritPray', name: '森の精霊への祈り', kind: 'story',
    outcome: { gold: 20, addTags: ['spirit-blessing'] },
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  forestClearPath: {
    id: 'forestClearPath', name: '森を切り拓く', kind: 'story',
    outcome: { gold: 30, addTags: ['forest-cleared'] },
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  spiritBlessingGift: {
    id: 'spiritBlessingGift', name: '精霊の加護', kind: 'story',
    outcome: { gold: 40 },
    condition: { requiresTags: ['spirit-blessing'] },
  },
  timberMerchantJob: {
    id: 'timberMerchantJob', name: '木材商からの依頼', kind: 'story',
    outcome: { gold: 35 },
    condition: { requiresTags: ['forest-cleared'] },
  },

  // --- 遺跡の本線：焼けた村（saw-ruins）の先で、生存者を助けるか遺物を奪うか。 ---
  aidSurvivors: {
    id: 'aidSurvivors', name: '生存者の救出', kind: 'story',
    outcome: { gold: 30, addTags: ['survivor-aid'] },
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  lootRelic: {
    id: 'lootRelic', name: '遺物の強奪', kind: 'story',
    outcome: { gold: 55, addTags: ['relic-looted'] },
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  elderThanksForRescue: {
    id: 'elderThanksForRescue', name: '村人からの感謝', kind: 'story',
    outcome: { gold: 25 },
    condition: { minChapter: 2, requiresTags: ['survivor-aid'] },
  },
  blackMarketDeal: {
    id: 'blackMarketDeal', name: '闇市での取引', kind: 'story',
    outcome: { gold: 60, addTags: ['black-market'] },
    condition: { minChapter: 2, requiresTags: ['relic-looted'], forbidsTags: ['black-market'] },
  },

  // --- 呪いの本線：解くか、取り込むか。第3章以降。 ---
  curseLift: {
    id: 'curseLift', name: '呪いを解く', kind: 'story',
    outcome: { gold: 40, addTags: ['curse-lifted'] },
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  curseEmbrace: {
    id: 'curseEmbrace', name: '呪いを取り込む', kind: 'story',
    outcome: { gold: 55, addTags: ['curse-embraced'] },
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  villageFestivalOfRelief: {
    id: 'villageFestivalOfRelief', name: '解呪を祝う宴', kind: 'story',
    outcome: { gold: 30 },
    condition: { minChapter: 3, requiresTags: ['curse-lifted'] },
  },
  darkPactWhispers: {
    id: 'darkPactWhispers', name: '闇の力の囁き', kind: 'story',
    outcome: { gold: 50 },
    condition: { minChapter: 3, requiresTags: ['curse-embraced'] },
  },

  // --- 第1章の汎用（タグなし）。母数を増やして毎日の3択に変化を持たせる。 ---
  travelingBard: {
    id: 'travelingBard', name: '旅の吟遊詩人', kind: 'story',
    outcome: { gold: 15 },
    condition: {},
  },
  riverCrossing: {
    id: 'riverCrossing', name: '増水した川渡り', kind: 'story',
    outcome: { gold: 20 },
    condition: {},
  },
  abandonedCart: {
    id: 'abandonedCart', name: '打ち捨てられた荷車', kind: 'story',
    outcome: { gold: 25 },
    condition: {},
  },
  villageFestival: {
    id: 'villageFestival', name: '村の収穫祭', kind: 'story',
    outcome: { gold: 30 },
    condition: {},
  },
  lostChild: {
    id: 'lostChild', name: '迷子の捜索', kind: 'story',
    outcome: { gold: 18 },
    condition: {},
  },
  oldWellRumor: {
    id: 'oldWellRumor', name: '古井戸の噂', kind: 'story',
    outcome: { gold: 22 },
    condition: {},
  },

  // --- 第2章の汎用。 ---
  tollBridgeDispute: {
    id: 'tollBridgeDispute', name: '関所の通行争い', kind: 'story',
    outcome: { gold: 35 },
    condition: { minChapter: 2 },
  },
  wanderingAlchemist: {
    id: 'wanderingAlchemist', name: '流浪の錬金術師', kind: 'story',
    outcome: { gold: 40 },
    condition: { minChapter: 2 },
  },
  floodedMine: {
    id: 'floodedMine', name: '水没した坑道', kind: 'story',
    outcome: { gold: 45 },
    condition: { minChapter: 2 },
  },
  noblesRequest: {
    id: 'noblesRequest', name: '貴族からの頼み事', kind: 'story',
    outcome: { gold: 50 },
    condition: { minChapter: 2 },
  },

  // --- 第3章以降の汎用。 ---
  mistCoveredShrine: {
    id: 'mistCoveredShrine', name: '霧に沈む祠', kind: 'story',
    outcome: { gold: 40 },
    condition: { minChapter: 3 },
  },
  bountyHunterRival: {
    id: 'bountyHunterRival', name: '賞金稼ぎとの鉢合わせ', kind: 'story',
    outcome: { gold: 45 },
    condition: { minChapter: 3 },
  },
  forgottenLibrary: {
    id: 'forgottenLibrary', name: '忘れられた書庫', kind: 'story',
    outcome: { gold: 55 },
    condition: { minChapter: 4 },
  },
} as const satisfies Record<string, DailyEvent>;
