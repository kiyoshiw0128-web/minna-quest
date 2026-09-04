import type { DailyEvent } from '../daily/event.js';

/**
 * イベントのプール。条件を満たすものからその日のシードで3つ引かれる。
 * どの章でも最低3つは候補が残るように組んである（健全性テストが番人）。
 *
 * 敵のマスタにはまだ炎竜バルゴスしかいないため、戦闘イベントはすべて
 * バルゴスを指している。雑魚敵を足すときに差し替える。
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
    enemyId: 'balgos',
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
    enemyId: 'balgos',
    condition: { minChapter: 2 },
  },
} as const satisfies Record<string, DailyEvent>;
