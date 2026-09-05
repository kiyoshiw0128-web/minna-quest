import type { DailyEvent } from '../daily/event.js';

/**
 * イベントのプール。条件を満たすものからその日のシードで3つ引かれる。
 * どの章でも最低3つは候補が残るように組んである（健全性テストが番人）。
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
    condition: { minChapter: 2 },
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
    condition: {},
  },
  dragonlingClash: {
    id: 'dragonlingClash', name: '悪竜の眷属との激突', kind: 'battle',
    enemyId: 'direWyvern',
    condition: { minChapter: 2 },
  },
  stoneGolemBlockade: {
    id: 'stoneGolemBlockade', name: '石の巨人が道を塞ぐ', kind: 'battle',
    enemyId: 'stoneGolem',
    condition: { minChapter: 2 },
  },
  voidWraithAmbush: {
    id: 'voidWraithAmbush', name: '影の亡霊に囚われる', kind: 'battle',
    enemyId: 'voidWraith',
    condition: { minChapter: 2 },
  },
} as const satisfies Record<string, DailyEvent>;
