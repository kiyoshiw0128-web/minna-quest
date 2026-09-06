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
    resultText: '分かれ道で一行は迷わず脇道を選んだ。近道のおかげで浮いた時間を荷運びの手伝いに充て、いくらかの金貨を稼いだ。',
    condition: {},
  },
  restAtSpring: {
    id: 'restAtSpring', name: '泉で休む', kind: 'story',
    outcome: { gold: 10 },
    resultText: '泉のほとりで一行はしばし休息を取った。居合わせた旅人から分けてもらった僅かな金貨を懐に、疲れを癒して先を急いだ。',
    condition: {},
  },
  banditAmbush: {
    id: 'banditAmbush', name: '山賊の待ち伏せ', kind: 'battle',
    enemyId: 'banditScout',
    resultText: '街道の陰から山賊の見張りが躍り出て、一行の行く手を塞いだ。得物を構え、戦いの構えを取る。',
    condition: {},
  },
  meetElder: {
    id: 'meetElder', name: '村の長老に会う', kind: 'story',
    outcome: { gold: 20, addTags: ['met-elder'] },
    resultText: '村を訪ねた一行は、長老に温かく迎えられた。旅の労をねぎらわれ、餞別の金貨とともに、この地で顔を覚えられることになった。',
    condition: { forbidsTags: ['met-elder'] },
  },
  elderTale: {
    id: 'elderTale', name: '長老の昔語り', kind: 'story',
    outcome: { gold: 50 },
    resultText: '顔なじみとなった長老は、夜更けまで昔語りに付き合ってくれた。語りの礼にと、思いのほか多くの金貨を渡された。',
    condition: { requiresTags: ['met-elder'] },
  },
  strayPuppy: {
    id: 'strayPuppy', name: '迷い犬', kind: 'story',
    outcome: { petId: 'puppy', addTags: ['has-pet'] },
    resultText: '道端でうずくまっていた子犬を、一行は放っておけずに拾い上げた。モモと名付けられたその犬は、以来ずっと一行のそばを離れない。',
    condition: { forbidsTags: ['has-pet'] },
  },
  merchantCaravan: {
    id: 'merchantCaravan', name: '隊商との交渉', kind: 'story',
    outcome: { gold: 120 },
    resultText: '隊商との交渉は一行に分があった。護衛の代わりに応分の金貨を受け取り、旅の路銀は大きく潤った。',
    condition: { minChapter: 2 },
  },
  burnedVillage: {
    id: 'burnedVillage', name: '焼けた村', kind: 'story',
    outcome: { gold: 40, addTags: ['saw-ruins'] },
    resultText: '焼け落ちた村の跡で、一行は焦土の中から金目のものを拾い集めた。何がここを襲ったのか、焼け跡は何も語らなかった。',
    condition: { minChapter: 2 },
  },
  dragonTracks: {
    id: 'dragonTracks', name: '竜の足跡', kind: 'story',
    outcome: { gold: 60 },
    resultText: '焼けた村の周辺を探ると、地面に深く刻まれた竜の足跡が見つかった。近くに落ちていた鱗を売り払い、それなりの金貨を得た。',
    condition: { minChapter: 2, requiresTags: ['saw-ruins'] },
  },
  scoutTheRidge: {
    id: 'scoutTheRidge', name: '尾根を偵察する', kind: 'battle',
    enemyId: 'armoredKnight',
    resultText: '尾根を偵察していた一行の前に、朽ちた鎧をまとう廃騎士が立ちはだかった。錆びた剣を構え、退く気配は無い。',
    condition: { minChapter: 3 },
  },

  // ここから追記分。既存10エントリは並び・内容とも変えていない。

  forestWolfAttack: {
    id: 'forestWolfAttack', name: '森の狼に襲われる', kind: 'battle',
    enemyId: 'forestWolf',
    resultText: '森を抜けようとした一行に、影から森の狼が飛びかかってきた。牙を剥き、唸り声を上げながら間合いを詰めてくる。',
    condition: {},
  },
  goblinCampRaid: {
    id: 'goblinCampRaid', name: 'ゴブリンの襲撃', kind: 'battle',
    enemyId: 'goblinRaider',
    resultText: 'ゴブリンの野営地に踏み込んだ一行は、掠奪者たちに囲まれた。棍棒を手にした群れが、じりじりと輪を縮めてくる。',
    condition: {},
  },
  ogreEncounter: {
    id: 'ogreEncounter', name: '人喰い鬼との遭遇', kind: 'battle',
    enemyId: 'ogreBrute',
    resultText: '峠道で、一行は人喰い鬼と鉢合わせた。巨体を揺らしながら大槌を振り上げ、逃げ場を塞ぐように立ちはだかる。',
    condition: { minChapter: 2 },
  },
  dragonlingClash: {
    id: 'dragonlingClash', name: '悪竜の眷属との激突', kind: 'battle',
    enemyId: 'direWyvern',
    resultText: '空を切り裂いて舞い降りた悪竜の眷属が、一行の前に降り立った。爪を鳴らし、獲物を品定めするように睨みつけてくる。',
    condition: { minChapter: 3 },
  },
  stoneGolemBlockade: {
    id: 'stoneGolemBlockade', name: '石の巨人が道を塞ぐ', kind: 'battle',
    enemyId: 'stoneGolem',
    resultText: '古い街道を塞ぐように、石の巨人が行く手に立っていた。呼びかけにも動じず、拳を構えたまま道を譲らない。',
    condition: { minChapter: 3 },
  },
  voidWraithAmbush: {
    id: 'voidWraithAmbush', name: '影の亡霊に囚われる', kind: 'battle',
    enemyId: 'voidWraith',
    resultText: '夜霧の中から、影を纏う亡霊がひたひたと現れた。輪郭さえおぼろげなその姿が、一行を戦いへと引きずり込む。',
    condition: { minChapter: 3 },
  },

  // ここから非戦闘の追記分（2026-09-05）。既存16エントリは並び・内容とも変えていない。
  // 敵は増やさず（8体で足りている）、ルートを枝分かれさせる非戦闘イベントのみ足す。

  // --- 山賊の本線：取引するか、通報するか。片方を選ぶともう片方は二度と出ない。 ---
  banditDeal: {
    id: 'banditDeal', name: '山賊との密約', kind: 'story',
    outcome: { gold: 35, addTags: ['bandit-pact'] },
    resultText: '山賊の頭目から持ちかけられた密約に、一行は乗ることにした。通行の安全と分け前の金貨を受け取り、衛兵への道は自ら閉ざした。',
    condition: { forbidsTags: ['bandit-pact', 'guard-favor'] },
  },
  guardReport: {
    id: 'guardReport', name: '衛兵への通報', kind: 'story',
    outcome: { gold: 25, addTags: ['guard-favor'] },
    resultText: '一行は山賊の企みを衛兵に通報した。報奨の金貨とともに衛兵隊からの信頼を得たが、山賊との縁はこれで完全に絶たれた。',
    condition: { forbidsTags: ['bandit-pact', 'guard-favor'] },
  },
  banditHideoutInvite: {
    id: 'banditHideoutInvite', name: '山賊の隠れ家への招待', kind: 'story',
    outcome: { gold: 50, addTags: ['bandit-den'] },
    resultText: '密約を結んだ山賊たちから、隠れ家への招待が届いた。奥に隠された分け前の金貨を渡され、一行はさらに深く彼らの側に組み込まれた。',
    condition: { requiresTags: ['bandit-pact'], forbidsTags: ['bandit-den'] },
  },
  guardEscortQuest: {
    id: 'guardEscortQuest', name: '衛兵隊の護衛任務', kind: 'story',
    outcome: { gold: 45, addTags: ['guard-quest'] },
    resultText: '信頼を得た衛兵隊から、正式な護衛任務が舞い込んだ。任務をやり遂げた一行には、相応の金貨が支払われた。',
    condition: { requiresTags: ['guard-favor'], forbidsTags: ['guard-quest'] },
  },

  // --- 森の精霊の本線：祈るか、切り拓くか。 ---
  forestSpiritPray: {
    id: 'forestSpiritPray', name: '森の精霊への祈り', kind: 'story',
    outcome: { gold: 20, addTags: ['spirit-blessing'] },
    resultText: '深い森の奥で、一行は精霊に祈りを捧げることを選んだ。木々を傷つけぬまま道は開かれ、いくばくかの供物の金貨が残されていた。',
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  forestClearPath: {
    id: 'forestClearPath', name: '森を切り拓く', kind: 'story',
    outcome: { gold: 30, addTags: ['forest-cleared'] },
    resultText: '一行は祈るより先に、斧を手に森を切り拓くことを選んだ。伐り出した木材はいくらかの金貨に換わったが、森の気配は二度と穏やかにならなかった。',
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  spiritBlessingGift: {
    id: 'spiritBlessingGift', name: '精霊の加護', kind: 'story',
    outcome: { gold: 40 },
    resultText: '祈りを聞き届けた精霊が、一行の前に姿を現した。加護の証として金貨が授けられ、森はこれまで以上に静かに一行を見守った。',
    condition: { requiresTags: ['spirit-blessing'] },
  },
  timberMerchantJob: {
    id: 'timberMerchantJob', name: '木材商からの依頼', kind: 'story',
    outcome: { gold: 35 },
    resultText: '切り拓かれた道に目をつけた木材商から、運搬の依頼が舞い込んだ。仕事をこなした一行には、約束通りの金貨が支払われた。',
    condition: { requiresTags: ['forest-cleared'] },
  },

  // --- 遺跡の本線：焼けた村（saw-ruins）の先で、生存者を助けるか遺物を奪うか。 ---
  aidSurvivors: {
    id: 'aidSurvivors', name: '生存者の救出', kind: 'story',
    outcome: { gold: 30, addTags: ['survivor-aid'] },
    resultText: '焼けた村の瓦礫の下から、一行は息のある生存者たちを見つけ出した。救出を優先し、遺跡に眠るという遺物には手を伸ばさなかった。',
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  lootRelic: {
    id: 'lootRelic', name: '遺物の強奪', kind: 'story',
    outcome: { gold: 55, addTags: ['relic-looted'] },
    resultText: '焼けた村の奥で、一行は生存者よりも遺物を選んだ。瓦礫の下から掘り出した遺物は高値で売れたが、助けを求める声には応えなかった。',
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  elderThanksForRescue: {
    id: 'elderThanksForRescue', name: '村人からの感謝', kind: 'story',
    outcome: { gold: 25 },
    resultText: '救われた村人たちが、一行のもとへ礼を伝えにやってきた。乏しい蓄えから搾り出された金貨には、それだけの重みがあった。',
    condition: { minChapter: 2, requiresTags: ['survivor-aid'] },
  },
  blackMarketDeal: {
    id: 'blackMarketDeal', name: '闇市での取引', kind: 'story',
    outcome: { gold: 60, addTags: ['black-market'] },
    resultText: '奪った遺物を、一行は闇市の商人に持ち込んだ。素性を問わない取引はまとまった金貨をもたらしたが、後ろ暗い筋への借りも残った。',
    condition: { minChapter: 2, requiresTags: ['relic-looted'], forbidsTags: ['black-market'] },
  },

  // --- 呪いの本線：解くか、取り込むか。第3章以降。 ---
  curseLift: {
    id: 'curseLift', name: '呪いを解く', kind: 'story',
    outcome: { gold: 40, addTags: ['curse-lifted'] },
    resultText: '土地に染み付いた呪いを前に、一行は解呪の道を選んだ。長い儀式の末に呪いは晴れ、村人から礼として金貨を受け取った。',
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  curseEmbrace: {
    id: 'curseEmbrace', name: '呪いを取り込む', kind: 'story',
    outcome: { gold: 55, addTags: ['curse-embraced'] },
    resultText: '一行は呪いを祓うのではなく、その力を自らに取り込むことを選んだ。禁忌に触れた対価として、闇に潜む者から金貨が差し出された。',
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  villageFestivalOfRelief: {
    id: 'villageFestivalOfRelief', name: '解呪を祝う宴', kind: 'story',
    outcome: { gold: 30 },
    resultText: '呪いが解けたことを祝い、村では宴が開かれた。一行は主賓として迎えられ、祝いの席で金貨を包んでもらった。',
    condition: { minChapter: 3, requiresTags: ['curse-lifted'] },
  },
  darkPactWhispers: {
    id: 'darkPactWhispers', name: '闇の力の囁き', kind: 'story',
    outcome: { gold: 50 },
    resultText: '取り込んだ呪いの力が、夜ごと一行に囁きかけてくる。その声に従った先で、思いがけない金貨のありかを教えられた。',
    condition: { minChapter: 3, requiresTags: ['curse-embraced'] },
  },

  // --- 第1章の汎用（タグなし）。母数を増やして毎日の3択に変化を持たせる。 ---
  travelingBard: {
    id: 'travelingBard', name: '旅の吟遊詩人', kind: 'story',
    outcome: { gold: 15 },
    resultText: '旅の吟遊詩人と道連れになり、一行はしばし歌に耳を傾けた。礼にと渡された小銭は、旅の足しになる程度の金貨だった。',
    condition: {},
  },
  riverCrossing: {
    id: 'riverCrossing', name: '増水した川渡り', kind: 'story',
    outcome: { gold: 20 },
    resultText: '増水した川を、一行は苦労の末に渡り切った。対岸で拾った流れ着いた荷から、いくらかの金貨が見つかった。',
    condition: {},
  },
  abandonedCart: {
    id: 'abandonedCart', name: '打ち捨てられた荷車', kind: 'story',
    outcome: { gold: 25 },
    resultText: '道端に打ち捨てられた荷車を、一行は調べてみることにした。荷の中に残っていた金貨を、持ち主が現れないまま懐に収めた。',
    condition: {},
  },
  villageFestival: {
    id: 'villageFestival', name: '村の収穫祭', kind: 'story',
    outcome: { gold: 30 },
    resultText: '通りかかった村では収穫祭の真っ最中だった。祭りに加わった一行は、賭け事や出し物でいくらかの金貨を稼いだ。',
    condition: {},
  },
  lostChild: {
    id: 'lostChild', name: '迷子の捜索', kind: 'story',
    outcome: { gold: 18 },
    resultText: '泣きじゃくる迷子を見つけた一行は、親元まで送り届けた。安堵した親から、心ばかりの金貨を渡された。',
    condition: {},
  },
  oldWellRumor: {
    id: 'oldWellRumor', name: '古井戸の噂', kind: 'story',
    outcome: { gold: 22 },
    resultText: '村外れの古井戸に金貨が沈んでいるという噂を、一行は確かめに行った。噂は本当で、底からいくらかの金貨を拾い上げた。',
    condition: {},
  },

  // --- 第2章の汎用。 ---
  tollBridgeDispute: {
    id: 'tollBridgeDispute', name: '関所の通行争い', kind: 'story',
    outcome: { gold: 35 },
    resultText: '関所で通行料をめぐる争いに巻き込まれた一行は、間に入って話をまとめた。礼として、双方から金貨を受け取った。',
    condition: { minChapter: 2 },
  },
  wanderingAlchemist: {
    id: 'wanderingAlchemist', name: '流浪の錬金術師', kind: 'story',
    outcome: { gold: 40 },
    resultText: '流浪の錬金術師と行き会い、一行は薬草集めを手伝った。調合した薬を売った分け前として、金貨を受け取った。',
    condition: { minChapter: 2 },
  },
  floodedMine: {
    id: 'floodedMine', name: '水没した坑道', kind: 'story',
    outcome: { gold: 45 },
    resultText: '水没した坑道に取り残された鉱夫を、一行は助け出した。感謝の印にと、坑道に眠っていた鉱石を売った金貨を分けてもらった。',
    condition: { minChapter: 2 },
  },
  noblesRequest: {
    id: 'noblesRequest', name: '貴族からの頼み事', kind: 'story',
    outcome: { gold: 50 },
    resultText: 'ある貴族から内密の頼み事を持ちかけられ、一行はそれを引き受けた。仕事を終えると、口止めも兼ねた十分な金貨が支払われた。',
    condition: { minChapter: 2 },
  },

  // --- 第3章以降の汎用。 ---
  mistCoveredShrine: {
    id: 'mistCoveredShrine', name: '霧に沈む祠', kind: 'story',
    outcome: { gold: 40 },
    resultText: '深い霧に沈む古い祠を、一行は見つけた。供物の中に残されていた金貨を、静かに持ち帰った。',
    condition: { minChapter: 3 },
  },
  bountyHunterRival: {
    id: 'bountyHunterRival', name: '賞金稼ぎとの鉢合わせ', kind: 'story',
    outcome: { gold: 45 },
    resultText: '同じ獲物を追っていた賞金稼ぎと鉢合わせた一行は、情報を交換することで手を組んだ。分け前として金貨を受け取り、それぞれの道を進んだ。',
    condition: { minChapter: 3 },
  },
  forgottenLibrary: {
    id: 'forgottenLibrary', name: '忘れられた書庫', kind: 'story',
    outcome: { gold: 55 },
    resultText: '打ち捨てられた書庫の奥で、一行は貴重な古書を見つけ出した。学者に売り渡した古書は、思いのほか高値がついた。',
    condition: { minChapter: 3 },
  },

  // --- ペットの入手経路（段階6）。既存エントリの内容には一切触れず、
  // 末尾に追記のみで足す（ファイル冒頭の「追記のみ」の約束を守る）。
  // strayPuppy を含めて8匹ぶん。タグなしの第1章汎用に合わせ、どれも
  // condition: {} で早期から出会える（設計書 §4「他のイベントにも petId を足す」）。
  wanderingKitten: {
    id: 'wanderingKitten', name: '迷い猫', kind: 'story',
    outcome: { petId: 'kitten', gold: 10 },
    resultText: '道に迷って鳴いていた子猫を、一行は放っておけず連れ帰った。ランと名付けられたその猫は、身軽な足取りで一行に付き従うようになった。',
    condition: {},
  },
  foxKitInTheBushes: {
    id: 'foxKitInTheBushes', name: '茂みの子狐', kind: 'story',
    outcome: { petId: 'foxKit', gold: 10 },
    resultText: '茂みの奥で震えていた子狐を、一行は見つけて助け出した。コンと名付けられた子狐は、以来一行のそばで警戒を怠らない。',
    condition: {},
  },
  injuredOwlChick: {
    id: 'injuredOwlChick', name: '傷ついた雛ふくろう', kind: 'story',
    outcome: { petId: 'owlChick', gold: 10 },
    resultText: '翼を傷めて動けずにいた雛ふくろうを、一行は介抱した。ホウと名付けられたそのふくろうは、傷が癒えても一行のもとに留まった。',
    condition: {},
  },
  slimeFollowsHome: {
    id: 'slimeFollowsHome', name: 'ついてきたスライム', kind: 'story',
    outcome: { petId: 'travelSlime', gold: 10 },
    resultText: '野営地に迷い込んできたスライムを、一行は追い払わずに受け入れた。以来そのスライムは、ぷるぷると揺れながら一行についてくるようになった。',
    condition: {},
  },
  ferretInTheLuggage: {
    id: 'ferretInTheLuggage', name: '荷物に潜むフェレット', kind: 'story',
    outcome: { petId: 'ferret', gold: 10 },
    resultText: '荷物の中に潜んでいたフェレットに、一行は旅の途中で気づいた。逃げる素振りも見せないその姿を、いつしか旅仲間として迎え入れた。',
    condition: {},
  },
  fallenFalconChick: {
    id: 'fallenFalconChick', name: '落ちてきた鷹の子', kind: 'story',
    outcome: { petId: 'messengerFalcon', gold: 10 },
    resultText: '野営地の近くに落ちていた鷹の雛を、一行は拾い上げて世話をした。育った鷹は伝令のように、以来一行の空を見守っている。',
    condition: {},
  },
  tortoiseCrossingTheRoad: {
    id: 'tortoiseCrossingTheRoad', name: '道を渡るリクガメ', kind: 'story',
    outcome: { petId: 'sturdyTortoise', gold: 10 },
    resultText: '道を横切ろうとしていたリクガメを、一行は轢かぬよう避けて助けた。硬い甲羅を持つそのリクガメは、以来のんびりと一行に付いてくる。',
    condition: {},
  },
} as const satisfies Record<string, DailyEvent>;
