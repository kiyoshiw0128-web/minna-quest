import { EVENTS } from '@mq/core';

/** 日々譚の地名。確定イベントを場所に結びつけ、既存の冒険記録にも使う。 */
export const LOCATIONS = {
  leaf: { name: 'リーフ村', x: 24, y: 63, symbol: '⌂', description: '赤い屋根が並ぶ、小さな旅立ちの村。街道を行き交う旅人の声が聞こえる。' },
  forest: { name: '月影の森', x: 25, y: 32, symbol: '♣', description: '木々の奥から、鳥の声が響く。古い大樹の根元に細い道が続いている。' },
  spring: { name: '精霊の泉', x: 45, y: 45, symbol: '◇', description: '澄んだ水面が静かに揺れている。泉のほとりには旅人の足跡が残っている。' },
  elm: { name: '王都エルム', x: 55, y: 66, symbol: '♜', description: '石造りの城門の向こうは、にぎやかな大通り。商人と衛兵が忙しく行き交う。' },
  ridge: { name: '白峰の峠', x: 51, y: 21, symbol: '▲', description: '冷たい風が尾根を吹き抜ける。岩肌に沿って、曲がりくねった道が伸びている。' },
  port: { name: '港町セルカ', x: 82, y: 65, symbol: '⚓', description: '帆船の向こうに青い海が広がる。波止場には遠くの街から荷が届いている。' },
  ruins: { name: '星詠みの遺跡', x: 78, y: 37, symbol: '▥', description: '崩れた石柱に、読めない文字が刻まれている。奥の通路からかすかな風が流れる。' },
  keep: { name: '黒曜の砦', x: 73, y: 13, symbol: '♜', description: '黒い岩山に砦がそびえる。門の向こうは静まり返り、重い気配が漂っている。' },
} as const;
export type LocationId = keyof typeof LOCATIONS;

// イベントIDや抽選順は変えない。場所は表示用の設定として別に持つ。
export const EVENT_LOCATIONS = {
  crossroads: 'leaf', restAtSpring: 'spring', banditAmbush: 'ridge', meetElder: 'leaf',
  elderTale: 'leaf', strayPuppy: 'leaf', merchantCaravan: 'port', burnedVillage: 'leaf',
  dragonTracks: 'ridge', scoutTheRidge: 'ridge', forestWolfAttack: 'forest', goblinCampRaid: 'forest',
  ogreEncounter: 'ridge', dragonlingClash: 'keep', stoneGolemBlockade: 'ruins', voidWraithAmbush: 'ruins',
  banditDeal: 'ridge', guardReport: 'elm', banditHideoutInvite: 'ridge', guardEscortQuest: 'elm',
  forestSpiritPray: 'forest', forestClearPath: 'forest', spiritBlessingGift: 'spring', timberMerchantJob: 'forest',
  aidSurvivors: 'ruins', lootRelic: 'ruins', elderThanksForRescue: 'leaf', blackMarketDeal: 'port',
  curseLift: 'spring', curseEmbrace: 'keep', villageFestivalOfRelief: 'leaf', darkPactWhispers: 'keep',
  travelingBard: 'elm', riverCrossing: 'spring', abandonedCart: 'ridge', villageFestival: 'leaf',
  lostChild: 'forest', oldWellRumor: 'leaf', tollBridgeDispute: 'elm', wanderingAlchemist: 'elm',
  floodedMine: 'ridge', noblesRequest: 'elm', mistCoveredShrine: 'ruins', bountyHunterRival: 'port',
  forgottenLibrary: 'ruins', wanderingKitten: 'leaf', foxKitInTheBushes: 'forest', injuredOwlChick: 'forest',
  slimeFollowsHome: 'spring', ferretInTheLuggage: 'port', fallenFalconChick: 'ridge', tortoiseCrossingTheRoad: 'leaf',
} satisfies Record<keyof typeof EVENTS, LocationId>;

const eventLocations = new Map<string, LocationId>(Object.entries(EVENT_LOCATIONS));
export function eventLocation(eventId: string | null | undefined): LocationId | null {
  return eventId == null ? null : eventLocations.get(eventId) ?? null;
}
