import type { LocationId } from '../daily/geography.js';

export type QuestStep = { readonly eventId: string; readonly tag: string; readonly objective: string; readonly location: LocationId; readonly victoryTag?: string };
export type Quest = { readonly id: string; readonly name: string; readonly steps: readonly QuestStep[] };
export const QUESTS: readonly Quest[] = [
  {
    "id": "mill",
    "name": "止まった水車",
    "steps": [
      {
        "eventId": "millRequest",
        "tag": "q-mill-1",
        "objective": "水車の依頼を引き受ける",
        "location": "leaf"
      },
      {
        "eventId": "millTracks",
        "tag": "q-mill-2",
        "objective": "森で水路の詰まりを調べる",
        "location": "forest"
      },
      {
        "eventId": "millBoar",
        "tag": "q-mill-3",
        "objective": "水路を守る大猪を倒す",
        "location": "forest",
        "victoryTag": "q-mill-won"
      },
      {
        "eventId": "millRepair",
        "tag": "q-mill-4",
        "objective": "リーフ村へ戻り、水車を修理する",
        "location": "leaf"
      }
    ]
  },
  {
    "id": "herb",
    "name": "泉の薬師",
    "steps": [
      {
        "eventId": "herbRequest",
        "tag": "q-herb-1",
        "objective": "薬師の頼みを聞く",
        "location": "leaf"
      },
      {
        "eventId": "herbSample",
        "tag": "q-herb-2",
        "objective": "精霊の泉で水を調べる",
        "location": "spring"
      },
      {
        "eventId": "herbSlime",
        "tag": "q-herb-3",
        "objective": "濁り沼のスライムを倒す",
        "location": "spring",
        "victoryTag": "q-herb-won"
      },
      {
        "eventId": "herbBrew",
        "tag": "q-herb-4",
        "objective": "リーフ村の薬師へ報告する",
        "location": "leaf"
      }
    ]
  },
  {
    "id": "caravan",
    "name": "峠に消えた荷",
    "steps": [
      {
        "eventId": "caravanRequest",
        "tag": "q-caravan-1",
        "objective": "商人組合の依頼を受ける",
        "location": "elm"
      },
      {
        "eventId": "caravanLedger",
        "tag": "q-caravan-2",
        "objective": "白峰の峠で荷車を探す",
        "location": "ridge"
      },
      {
        "eventId": "caravanHarrier",
        "tag": "q-caravan-3",
        "objective": "白峰の怪鳥を倒す",
        "location": "ridge",
        "victoryTag": "q-caravan-won"
      },
      {
        "eventId": "caravanReturn",
        "tag": "q-caravan-4",
        "objective": "王都エルムの組合へ報告する",
        "location": "elm"
      }
    ]
  },
  {
    "id": "beacon",
    "name": "消えた灯台の灯",
    "steps": [
      {
        "eventId": "beaconRequest",
        "tag": "q-beacon-1",
        "objective": "灯台守の相談を聞く",
        "location": "port"
      },
      {
        "eventId": "beaconLens",
        "tag": "q-beacon-2",
        "objective": "星詠みの遺跡でレンズを探す",
        "location": "ruins"
      },
      {
        "eventId": "beaconCrab",
        "tag": "q-beacon-3",
        "objective": "灯台を塞ぐ鎧ガニを倒す",
        "location": "port",
        "victoryTag": "q-beacon-won"
      },
      {
        "eventId": "beaconRelight",
        "tag": "q-beacon-4",
        "objective": "灯台守とレンズを据え直す",
        "location": "port"
      }
    ]
  },
  {
    "id": "stars",
    "name": "星の記録",
    "steps": [
      {
        "eventId": "starsRequest",
        "tag": "q-stars-1",
        "objective": "星詠みの遺跡で石板を調べる",
        "location": "ruins"
      },
      {
        "eventId": "starsSeal",
        "tag": "q-stars-2",
        "objective": "黒曜の砦で刻印を照合する",
        "location": "keep"
      },
      {
        "eventId": "starsSentinel",
        "tag": "q-stars-3",
        "objective": "星詠みの番人を倒す",
        "location": "keep",
        "victoryTag": "q-stars-won"
      },
      {
        "eventId": "starsRead",
        "tag": "q-stars-4",
        "objective": "星詠みの遺跡で記録を読み解く",
        "location": "ruins"
      }
    ]
  }
];
