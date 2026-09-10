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
    resultText: '星詠みの遺跡のふもと、アッシュ村は焼け落ちていた。一行は焦土の中から金目のものを拾い集めた。何がここを襲ったのか、焼け跡は何も語らなかった。',
    condition: { minChapter: 2 },
  },
  dragonTracks: {
    id: 'dragonTracks', name: '竜の足跡', kind: 'story',
    outcome: { gold: 60 },
    resultText: 'アッシュ村の焼け跡の周辺を探ると、地面に深く刻まれた竜の足跡が見つかった。近くに落ちていた鱗を売り払い、それなりの金貨を得た。',
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
    resultText: '月影の森の大樹の前で、一行は精霊に祈りを捧げることを選んだ。木々を傷つけぬまま道は開かれ、いくばくかの供物の金貨が残されていた。',
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  forestClearPath: {
    id: 'forestClearPath', name: '森を切り拓く', kind: 'story',
    outcome: { gold: 30, addTags: ['forest-cleared'] },
    resultText: '月影の森で、一行は祈るより先に、斧を手に森を切り拓くことを選んだ。伐り出した木材はいくらかの金貨に換わったが、森の気配は二度と穏やかにならなかった。',
    condition: { forbidsTags: ['spirit-blessing', 'forest-cleared'] },
  },
  spiritBlessingGift: {
    id: 'spiritBlessingGift', name: '精霊の加護', kind: 'story',
    outcome: { gold: 40 },
    resultText: '月影の森の大樹から、祈りを聞き届けた精霊が姿を現した。加護の証として金貨が授けられ、森はこれまで以上に静かに一行を見守った。',
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
    resultText: 'アッシュ村の瓦礫の下から、一行は息のある生存者たちを見つけ出した。救出を優先し、村人たちをリーフ村へ向かう救援隊に託した。遺跡に眠るという遺物には手を伸ばさなかった。',
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  lootRelic: {
    id: 'lootRelic', name: '遺物の強奪', kind: 'story',
    outcome: { gold: 55, addTags: ['relic-looted'] },
    resultText: 'アッシュ村の焼け跡の奥で、一行は生存者よりも遺物を選んだ。瓦礫の下から掘り出した遺物は高値で売れたが、助けを求める声には応えなかった。',
    condition: { minChapter: 2, requiresTags: ['saw-ruins'], forbidsTags: ['survivor-aid', 'relic-looted'] },
  },
  elderThanksForRescue: {
    id: 'elderThanksForRescue', name: '村人からの感謝', kind: 'story',
    outcome: { gold: 25 },
    resultText: 'リーフ村に避難したアッシュ村の人々が、一行に救出の礼を伝えにやってきた。乏しい蓄えから搾り出された金貨には、それだけの重みがあった。',
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
    resultText: '黒曜の砦に染み付いた呪いを前に、一行は解呪の道を選んだ。長い儀式の末に呪いは晴れ、同行した村の使者から礼として金貨を受け取った。',
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  curseEmbrace: {
    id: 'curseEmbrace', name: '呪いを取り込む', kind: 'story',
    outcome: { gold: 55, addTags: ['curse-embraced'] },
    resultText: '黒曜の砦で、一行は呪いを祓うのではなく、その力を自らに取り込むことを選んだ。禁忌に触れた対価として、闇に潜む者から金貨が差し出された。',
    condition: { minChapter: 3, forbidsTags: ['curse-lifted', 'curse-embraced'] },
  },
  villageFestivalOfRelief: {
    id: 'villageFestivalOfRelief', name: '解呪を祝う宴', kind: 'story',
    outcome: { gold: 30 },
    resultText: '黒曜の砦の呪いが解けたことを祝い、リーフ村では宴が開かれた。一行は主賓として迎えられ、祝いの席で金貨を包んでもらった。',
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
  // 街ごとの連続依頼と探索戦（2026-09-10）。既存52件の順序は維持。
  millRequest: {
    "id": "millRequest",
    "name": "水車小屋の依頼",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-mill-1"
      ],
      "gold": 15
    },
    "resultText": "水車が止まり、村の粉挽きが困っていた。一行は修理の相談を受け、月影の森を流れる水路を調べることにした。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [],
      "forbidsTags": [
        "q-mill-1"
      ]
    }
  },
  millTracks: {
    "id": "millTracks",
    "name": "せき止められた水路",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-mill-2"
      ],
      "gold": 15
    },
    "resultText": "水路には折れ枝と茨が積み重なっていた。泥に残る大きな足跡をたどると、茨まといの大猪がねぐらを作っている。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-mill-1"
      ],
      "forbidsTags": [
        "q-mill-2"
      ]
    }
  },
  millBoar: {
    "id": "millBoar",
    "name": "水路の大猪に挑む",
    "kind": "battle",
    "outcome": {
      "addTags": [
        "q-mill-3"
      ]
    },
    "resultText": "大猪が水路の前に立ちはだかった。一行は村へ水を戻すため、茨の牙を持つ獣に向き合う。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-mill-2"
      ],
      "forbidsTags": [
        "q-mill-3"
      ]
    },
    "enemyId": "brambleBoar",
    "victoryTag": "q-mill-won"
  },
  millRepair: {
    "id": "millRepair",
    "name": "水車を回す",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-mill-4"
      ],
      "gold": 70
    },
    "resultText": "大猪を退けた知らせを受け、村人たちは水路の枝を取り除いた。リーフ村の水車が再び回り、粉挽きは焼きたてのパンと謝礼を一行に渡した。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-mill-won"
      ],
      "forbidsTags": [
        "q-mill-4"
      ]
    }
  },
  herbRequest: {
    "id": "herbRequest",
    "name": "薬師の頼み",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-herb-1"
      ],
      "gold": 15
    },
    "resultText": "リーフ村の薬師から、濁った水で薬草を洗えなくなったと聞いた。一行は精霊の泉の上流で、濁りの原因を探すことにした。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [],
      "forbidsTags": [
        "q-herb-1"
      ]
    }
  },
  herbSample: {
    "id": "herbSample",
    "name": "濁りの源をたどる",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-herb-2"
      ],
      "gold": 15
    },
    "resultText": "泉へ注ぐ小川の底に、粘り気のある泥がたまっていた。一行が枝で触れると、泥の塊が動き出した。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-herb-1"
      ],
      "forbidsTags": [
        "q-herb-2"
      ]
    }
  },
  herbSlime: {
    "id": "herbSlime",
    "name": "濁り沼の主に挑む",
    "kind": "battle",
    "outcome": {
      "addTags": [
        "q-herb-3"
      ]
    },
    "resultText": "濁り沼のスライムが水を抱え込んでいる。このままでは泉の濁りは引かない。一行は岸辺に足場を取り、戦いの準備をした。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-herb-2"
      ],
      "forbidsTags": [
        "q-herb-3"
      ]
    },
    "enemyId": "bogSlime",
    "victoryTag": "q-herb-won"
  },
  herbBrew: {
    "id": "herbBrew",
    "name": "薬師へ澄んだ水を届ける",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-herb-4"
      ],
      "gold": 70
    },
    "resultText": "スライムが消えたあと、小川の水は澄み始めた。一行の届けた水で薬を仕上げた薬師は、患者が楽になったことを伝え、謝礼を差し出した。",
    "condition": {
      "minChapter": 1,
      "requiresTags": [
        "q-herb-won"
      ],
      "forbidsTags": [
        "q-herb-4"
      ]
    }
  },
  caravanRequest: {
    "id": "caravanRequest",
    "name": "商人組合の捜索依頼",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-caravan-1"
      ],
      "gold": 15
    },
    "resultText": "王都エルムの商人組合で、白峰の峠を越える荷車が戻らないと聞いた。一行は荷印を教わり、捜索を引き受けた。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [],
      "forbidsTags": [
        "q-caravan-1"
      ]
    }
  },
  caravanLedger: {
    "id": "caravanLedger",
    "name": "峠の荷札を拾う",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-caravan-2"
      ],
      "gold": 15
    },
    "resultText": "峠道に破れた荷札と車輪の跡が残っていた。荷車は崖際で止まり、積み荷を狙う怪鳥が上空を旋回している。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-caravan-1"
      ],
      "forbidsTags": [
        "q-caravan-2"
      ]
    }
  },
  caravanHarrier: {
    "id": "caravanHarrier",
    "name": "積み荷を狙う怪鳥",
    "kind": "battle",
    "outcome": {
      "addTags": [
        "q-caravan-3"
      ]
    },
    "resultText": "白峰の怪鳥が荷車へ急降下してきた。一行は怯える御者を岩陰へ退かせ、荷台の前で武器を構えた。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-caravan-2"
      ],
      "forbidsTags": [
        "q-caravan-3"
      ]
    },
    "enemyId": "ridgeHarrier",
    "victoryTag": "q-caravan-won"
  },
  caravanReturn: {
    "id": "caravanReturn",
    "name": "荷車を王都へ送り届ける",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-caravan-4"
      ],
      "gold": 70
    },
    "resultText": "怪鳥を退けた一行は、御者とともに荷を積み直して王都へ帰った。荷印を確かめた組合長は、約束の謝礼を渡した。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-caravan-won"
      ],
      "forbidsTags": [
        "q-caravan-4"
      ]
    }
  },
  beaconRequest: {
    "id": "beaconRequest",
    "name": "灯台守の相談",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-beacon-1"
      ],
      "gold": 15
    },
    "resultText": "港町セルカの灯台は、割れた集光レンズのため灯を失っていた。灯台守は、星詠みの遺跡に同じ仕組みの古い灯器があると教えてくれた。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [],
      "forbidsTags": [
        "q-beacon-1"
      ]
    }
  },
  beaconLens: {
    "id": "beaconLens",
    "name": "遺跡の集光レンズ",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-beacon-2"
      ],
      "gold": 15
    },
    "resultText": "遺跡の崩れた灯器から、傷の少ない集光レンズを見つけた。一行は布に包み、港町セルカへ運ぶことにした。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-beacon-1"
      ],
      "forbidsTags": [
        "q-beacon-2"
      ]
    }
  },
  beaconCrab: {
    "id": "beaconCrab",
    "name": "灯台階段の鎧ガニ",
    "kind": "battle",
    "outcome": {
      "addTags": [
        "q-beacon-3"
      ]
    },
    "resultText": "港へ戻ると、灯台の階段を巨大な鎧ガニが塞いでいた。レンズを守るため、一行は波を避けながら大ばさみに向き合う。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-beacon-2"
      ],
      "forbidsTags": [
        "q-beacon-3"
      ]
    },
    "enemyId": "brineCrab",
    "victoryTag": "q-beacon-won"
  },
  beaconRelight: {
    "id": "beaconRelight",
    "name": "灯台に灯をともす",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-beacon-4"
      ],
      "gold": 70
    },
    "resultText": "鎧ガニを退けた一行は、灯台守とレンズを据え直した。セルカの海に光の道が伸び、沖の船から応える鐘が響いた。",
    "condition": {
      "minChapter": 2,
      "requiresTags": [
        "q-beacon-won"
      ],
      "forbidsTags": [
        "q-beacon-4"
      ]
    }
  },
  starsRequest: {
    "id": "starsRequest",
    "name": "読めない星図",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-stars-1"
      ],
      "gold": 15
    },
    "resultText": "星詠みの遺跡で、星の並びを記した石板が見つかった。欠けた刻印は黒曜の砦の門章と似ている。一行は記録の続きを探すことにした。",
    "condition": {
      "minChapter": 3,
      "requiresTags": [],
      "forbidsTags": [
        "q-stars-1"
      ]
    }
  },
  starsSeal: {
    "id": "starsSeal",
    "name": "砦の観測室",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-stars-2"
      ],
      "gold": 15
    },
    "resultText": "砦の奥に、古い観測室が残されていた。石板と同じ刻印に手を触れると、眠っていた番人の胸に光が宿った。",
    "condition": {
      "minChapter": 3,
      "requiresTags": [
        "q-stars-1"
      ],
      "forbidsTags": [
        "q-stars-2"
      ]
    }
  },
  starsSentinel: {
    "id": "starsSentinel",
    "name": "観測室の番人",
    "kind": "battle",
    "outcome": {
      "addTags": [
        "q-stars-3"
      ]
    },
    "resultText": "星詠みの番人が観測記録の前を塞いだ。胸の光が強まるたび、床に星形の影が広がる。一行はその動きを見極めようとした。",
    "condition": {
      "minChapter": 3,
      "requiresTags": [
        "q-stars-2"
      ],
      "forbidsTags": [
        "q-stars-3"
      ]
    },
    "enemyId": "starSentinel",
    "victoryTag": "q-stars-won"
  },
  starsRead: {
    "id": "starsRead",
    "name": "星の記録を読み解く",
    "kind": "story",
    "outcome": {
      "addTags": [
        "q-stars-4"
      ],
      "gold": 70
    },
    "resultText": "番人の守っていた記録を遺跡へ持ち帰り、石板と重ねた。そこには、砦がかつて星を観測する場所だったことが記されていた。一行の発見は、学者の手で新しい地誌に書き加えられた。",
    "condition": {
      "minChapter": 3,
      "requiresTags": [
        "q-stars-won"
      ],
      "forbidsTags": [
        "q-stars-4"
      ]
    }
  },
  granaryRats: {
    "id": "granaryRats",
    "name": "穀倉の見回り",
    "kind": "battle",
    "enemyId": "grainRat",
    "resultText": "穀倉から袋を破る音が聞こえる。大ネズミが穀物の山から飛び出し、一行に歯をむいた。",
    "condition": {
      "minChapter": 1
    }
  },
  forestBramble: {
    "id": "forestBramble",
    "name": "森の茨道を探索する",
    "kind": "battle",
    "enemyId": "brambleBoar",
    "resultText": "茨の絡む獣道を進むと、地面が揺れた。大猪が低く唸り、一行の前で足を踏み鳴らしている。",
    "condition": {
      "minChapter": 1
    }
  },
  portCrabPatrol: {
    "id": "portCrabPatrol",
    "name": "波止場の夜回り",
    "kind": "battle",
    "enemyId": "brineCrab",
    "resultText": "夜の波止場で、積まれた木箱が崩れた。荷の陰から鎧ガニが現れ、大ばさみを振り上げた。",
    "condition": {
      "minChapter": 2
    }
  },
  ruinsSentinelPatrol: {
    "id": "ruinsSentinelPatrol",
    "name": "遺跡の地下回廊を探索する",
    "kind": "battle",
    "enemyId": "starSentinel",
    "resultText": "地下回廊を照らすと、石像の胸が光り始めた。星詠みの番人が足元の砂を払い、一行へ向き直った。",
    "condition": {
      "minChapter": 3
    }
  },
  dockRats: {
    id: 'dockRats', name: '港の倉庫を守る', kind: 'battle', enemyId: 'grainRat',
    resultText: '港町セルカの倉庫で、穀物袋が食い破られていた。荷役人が退いたあと、大ネズミが一行の足元へ飛びかかる。', condition: {},
  },
  portCargo: {
    id: 'portCargo', name: '船荷の仕分けを手伝う', kind: 'story', outcome: { gold: 22 },
    resultText: 'セルカの波止場で、一行は荷印ごとに船荷を仕分けた。夕方には出航の準備が整い、船頭から働いた分の賃金を受け取った。', condition: {},
  },
} as const satisfies Record<string, DailyEvent>;
