import { EVENTS } from '../data/events.js';
import { eligibleEvents, pickEvents } from './event.js';
import type { DailyEvent, WorldFlags } from './event.js';
import { questProgress } from './quest.js';
import { QUESTS } from '../data/quests.js';
import { isBossDay } from './day.js';

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
  elderTale: 'leaf', strayPuppy: 'leaf', merchantCaravan: 'port', burnedVillage: 'ruins',
  dragonTracks: 'ruins', scoutTheRidge: 'ridge', forestWolfAttack: 'forest', goblinCampRaid: 'forest',
  ogreEncounter: 'ridge', dragonlingClash: 'keep', stoneGolemBlockade: 'ruins', voidWraithAmbush: 'ruins',
  banditDeal: 'ridge', guardReport: 'elm', banditHideoutInvite: 'ridge', guardEscortQuest: 'elm',
  forestSpiritPray: 'forest', forestClearPath: 'forest', spiritBlessingGift: 'forest', timberMerchantJob: 'forest',
  aidSurvivors: 'ruins', lootRelic: 'ruins', elderThanksForRescue: 'leaf', blackMarketDeal: 'port',
  curseLift: 'keep', curseEmbrace: 'keep', villageFestivalOfRelief: 'leaf', darkPactWhispers: 'keep',
  travelingBard: 'elm', riverCrossing: 'spring', abandonedCart: 'ridge', villageFestival: 'leaf',
  lostChild: 'forest', oldWellRumor: 'leaf', tollBridgeDispute: 'elm', wanderingAlchemist: 'elm',
  floodedMine: 'ridge', noblesRequest: 'elm', mistCoveredShrine: 'ruins', bountyHunterRival: 'port',
  forgottenLibrary: 'ruins', wanderingKitten: 'leaf', foxKitInTheBushes: 'forest', injuredOwlChick: 'forest',
  slimeFollowsHome: 'spring', ferretInTheLuggage: 'port', fallenFalconChick: 'ridge', tortoiseCrossingTheRoad: 'leaf',
  millRequest: 'leaf',
  millTracks: 'forest',
  millBoar: 'forest',
  millRepair: 'leaf',
  herbRequest: 'leaf',
  herbSample: 'spring',
  herbSlime: 'spring',
  herbBrew: 'leaf',
  caravanRequest: 'elm',
  caravanLedger: 'ridge',
  caravanHarrier: 'ridge',
  caravanReturn: 'elm',
  beaconRequest: 'port',
  beaconLens: 'ruins',
  beaconCrab: 'port',
  beaconRelight: 'port',
  starsRequest: 'ruins',
  starsSeal: 'keep',
  starsSentinel: 'keep',
  starsRead: 'ruins',
  granaryRats: 'leaf',
  forestBramble: 'forest',
  portCrabPatrol: 'port',
  ruinsSentinelPatrol: 'ruins',
  dockRats: 'port', portCargo: 'port',
} satisfies Record<keyof typeof EVENTS, LocationId>;

const eventLocations = new Map<string, LocationId>(Object.entries(EVENT_LOCATIONS));
export function eventLocation(eventId: string | null | undefined): LocationId | null {
  return eventId == null ? null : eventLocations.get(eventId) ?? null;
}

/** 双方向の街道。翌日の行動は現在地か、ここで直接つながる場所に限る。 */
export const ROADS: Record<LocationId, readonly LocationId[]> = {
  leaf: ['forest', 'spring', 'elm'],
  forest: ['leaf', 'spring', 'ridge'],
  spring: ['leaf', 'forest', 'elm', 'ridge'],
  elm: ['leaf', 'spring', 'port', 'ruins'],
  ridge: ['forest', 'spring', 'ruins', 'keep'],
  port: ['elm', 'ruins'],
  ruins: ['elm', 'ridge', 'port', 'keep'],
  keep: ['ridge', 'ruins'],
};

/** 旧版ですでに提示した遠方の選択肢にも、経由地を示せるようにする。 */
export function routeTo(from: LocationId, to: LocationId): readonly LocationId[] {
  const queue: LocationId[][] = [[from]];
  const visited = new Set<LocationId>([from]);
  for (const path of queue) {
    const last = path[path.length - 1]!;
    if (last === to) return path;
    for (const next of ROADS[last]) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}

/**
 * 地理対応版の抽選。旧 pickEvents は再現用に維持し、確定済みの候補は引き直さない。
 * 最低1つは隣へ進む候補を残し、同じ場所に閉じ込められることを防ぐ。
 */
export function pickAdventureEvents(
  pool: readonly DailyEvent[], flags: WorldFlags, seed: number, current: LocationId, dayNo = 1,
): readonly DailyEvent[] {
  const nearby = eligibleEvents(pool, flags).filter((event) => {
    const place = eventLocation(event.id);
    // ボスの日は別の敵が優先するため、一度きりの依頼戦を消費させない。
    return !(event.victoryTag && isBossDay(dayNo))
      && !(event.id === 'burnedVillage' && flags.tags.includes('saw-ruins'))
      && place !== null && (place === current || ROADS[current].includes(place));
  });
  const active = questProgress(flags.tags).filter((quest) => !quest.completed && !quest.awaitingBattle);
  const continuations = nearby.filter((event) => active.some((quest) => quest.step.eventId === event.id));
  // 続きが遠方なら、その目的地へ近づく街道上の行動を候補に残す。
  const nextStops = active.map((quest) => routeTo(current, quest.step.location)[1]);
  const towards = nearby.filter((event) => {
    const place = eventLocation(event.id);
    return place !== null && nextStops.includes(place);
  });
  const starts = nearby.filter((event) => QUESTS.some((quest) => quest.steps[0]!.eventId === event.id));
  const selected: DailyEvent[] = [];
  const addOne = (candidates: readonly DailyEvent[]) => {
    const choice = pickEvents(candidates.filter((event) => !selected.includes(event)), flags, seed)[0];
    if (choice && selected.length < 3) selected.push(choice);
  };
  addOne(continuations.length ? continuations : towards.length ? towards : starts);
  if (!selected.some((event) => event.kind === 'battle')) addOne(nearby.filter((event) => event.kind === 'battle'));
  if (!selected.some((event) => eventLocation(event.id) !== current)) addOne(nearby.filter((event) => eventLocation(event.id) !== current));
  if (!selected.some((event) => event.kind === 'story')) addOne(nearby.filter((event) => event.kind === 'story'));
  for (const event of pickEvents(nearby.filter((event) => !selected.includes(event)), flags, seed)) {
    if (selected.length < 3) selected.push(event);
  }
  return selected;
}

/** 場所の説明は、世界に確定済みの選択を反映する。投票中の選択は渡さない。 */
export function locationDescription(location: LocationId, tags: readonly string[]): string {
  const changes: string[] = [];
  if (location === 'leaf' && tags.includes('q-mill-4')) changes.push('修理した水車が回り、粉挽き小屋からパンの香りが漂ってくる。');
  if (location === 'leaf' && tags.includes('q-herb-4')) changes.push('薬師の家では、届けた水で仕上げた薬が役立っている。');
  if (location === 'spring' && tags.includes('q-herb-won')) changes.push('スライムを退けた上流から、澄んだ水が戻りつつある。');
  if (location === 'elm' && tags.includes('q-caravan-4')) changes.push('組合の前には、無事に送り届けた荷車が止まっている。');
  if (location === 'port' && tags.includes('q-beacon-4')) changes.push('修復した灯台が海を照らし、入港する船を導いている。');
  if (location === 'ruins' && tags.includes('q-stars-4')) changes.push('学者たちは一行の持ち帰った観測記録を読み進めている。');
  return [baseLocationDescription(location, tags), ...changes].join('');
}

function baseLocationDescription(location: LocationId, tags: readonly string[]): string {
  if (location === 'ruins') {
    if (tags.includes('survivor-aid')) return '星詠みの遺跡のふもとに、焼けたアッシュ村がある。救い出した村人たちは避難し、焼け跡には救出に使った縄が残っている。';
    if (tags.includes('relic-looted')) return '星詠みの遺跡のふもと、焼けたアッシュ村は静まり返っている。持ち去った遺物の跡が、瓦礫の間に空いている。';
    if (tags.includes('saw-ruins')) return '星詠みの遺跡のふもとに、焼けたアッシュ村がある。崩れた家々にはまだ手が入っておらず、周囲には何かが通った深い跡が残る。';
    return '古い石柱が並ぶ星詠みの遺跡。そのふもとにはアッシュ村へ向かう枝道が続く。村の様子は、ここからはうかがえない。';
  }
  if (location === 'forest') {
    if (tags.includes('forest-cleared')) return '月影の森には切り株が並び、木材を運ぶ道が開いている。大樹の奥から響く物音に、以前の穏やかさはない。';
    if (tags.includes('spirit-blessing')) return '月影の森では、木々を傷つけずに開いた道が大樹へ続く。祈りを受けた精霊の気配が、枝葉の間に息づいている。';
  }
  if (location === 'keep') {
    if (tags.includes('curse-lifted')) return '黒曜の砦を覆っていた呪いは晴れた。黒い石壁は残っているが、門を抜ける風にあの重苦しさはない。';
    if (tags.includes('curse-embraced')) return '黒曜の砦の暗がりが、一行の内に取り込んだ力に応える。壁の向こうから低い囁きが聞こえる。';
  }
  if (location === 'leaf' && tags.includes('survivor-aid')) return '赤い屋根のリーフ村には、アッシュ村から避難した人々の姿もある。街道沿いの宿で、旅人と村人が火を囲んでいる。';
  return LOCATIONS[location].description;
}

export function chapterStory(chapter: number, tags: readonly string[]): string {
  if (chapter <= 1) return '旅のはじまりはリーフ村。街道をたどり、森や街で出会う人々と関わりながら、一行の進む道を選んでいこう。';
  if (chapter === 2) return tags.includes('saw-ruins')
    ? '焼けたアッシュ村で見たものが、旅に影を落としている。村に戻って調べるか、街や港で次の手がかりを探すか。一行の選択がその先を変える。'
    : '旅は続き、街や港では新たな仕事が待っている。星詠みの遺跡のふもとにも、訪ねてみる集落がある。';
  if (tags.includes('curse-lifted')) return '黒曜の砦の呪いは晴れた。これまで出会った人々や、まだ訪ねていない土地へ、冒険は続く。';
  if (tags.includes('curse-embraced')) return '一行は呪いの力を引き受けた。その囁きを抱えながら、次に進む道を選ぶ。';
  return '旅の先には、古い遺跡と黒曜の砦が待つ。人々との縁をたどりながら、この土地に残る呪いにどう向き合うかを決めよう。';
}
