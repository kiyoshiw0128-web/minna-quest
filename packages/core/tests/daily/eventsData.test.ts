import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../src/data/events.js';
import { NAMES } from '../../src/data/names.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { PETS } from '../../src/data/pets.js';
import { BATTLE_REWARDS } from '../../src/data/battleRewards.js';
import { eligibleEvents, applyOutcome, OPTIONS_PER_DAY } from '../../src/daily/event.js';
import { RECRUITS_PER_DAY } from '../../src/daily/recruit.js';
import type { DailyEvent } from '../../src/daily/event.js';

const events: readonly DailyEvent[] = Object.values(EVENTS);

describe('イベントマスタの健全性', () => {
  it('キーと id が一致している', () => {
    for (const [key, event] of Object.entries(EVENTS)) {
      expect(event.id).toBe(key);
    }
  });

  it('戦闘イベントは実在する敵を指す', () => {
    for (const event of events) {
      if (event.kind === 'battle') {
        expect(event.enemyId).toBeDefined();
        expect(Object.keys(ENEMIES)).toContain(event.enemyId);
      }
    }
  });

  it('非戦闘イベントは結果を持つ', () => {
    for (const event of events) {
      if (event.kind === 'story') expect(event.outcome).toBeDefined();
    }
  });

  it('章の範囲が逆転していない', () => {
    for (const event of events) {
      const { minChapter, maxChapter } = event.condition;
      if (minChapter !== undefined && maxChapter !== undefined) {
        expect(minChapter).toBeLessThanOrEqual(maxChapter);
      }
    }
  });

  it('必要フラグと禁止フラグが同じものを指していない', () => {
    for (const event of events) {
      for (const tag of event.condition.requiresTags ?? []) {
        expect(event.condition.forbidsTags ?? []).not.toContain(tag);
      }
    }
  });

  it('要求フラグ・禁止フラグは、どれかのイベントが与えうる', () => {
    // requiresTags は「出すための条件」、forbidsTags は「隠すための条件」。
    // どちらも誰も付与しないタグを書くと、書き間違いに気づけないまま
    // 「絶対に出ない」または「絶対に隠れない（常に真の排他になっていない）」
    // イベントが生まれる。
    const grantable = new Set(events.flatMap((event) => event.outcome?.addTags ?? []));
    for (const event of events) {
      for (const tag of event.condition.requiresTags ?? []) {
        expect(grantable).toContain(tag);
      }
      for (const tag of event.condition.forbidsTags ?? []) {
        expect(grantable).toContain(tag);
      }
    }
  });

  // 3択の母数。3だと数日で同じ顔ぶれが巡ってくるので、5つは候補が
  // 残るように育てる。第5章くらいまで押さえておけば十分（章が進むほど
  // minChapter の条件が緩む一方なので、候補は増えることはあっても減らない）。
  const MIN_CANDIDATES = 5;
  const CHAPTERS_TO_CHECK = [1, 2, 3, 4, 5];

  it('どの章でも、3択を埋められるだけの候補が十分にある', () => {
    for (const chapter of CHAPTERS_TO_CHECK) {
      const count = eligibleEvents(events, { chapter, tags: [] }).length;
      expect(count).toBeGreaterThanOrEqual(MIN_CANDIDATES);
    }
  });

  it('すべての敵に戦闘報酬が定義されている（漏れるとサーバが例外を投げる）', () => {
    for (const enemyId of Object.keys(ENEMIES)) {
      expect(BATTLE_REWARDS[enemyId]).toBeDefined();
    }
  });

  // 段階6・設計書 §4：「他のイベントにも petId を足す。8匹ぶんの入手経路を用意する」。
  it('petId を持つ選択肢はすべて実在するペットを指す', () => {
    for (const event of events) {
      const petId = event.outcome?.petId;
      if (petId === undefined) continue;
      expect(Object.keys(PETS)).toContain(petId);
    }
  });

  it('8匹すべてに、少なくとも1つの入手経路がある', () => {
    const grantedPetIds = new Set(events.flatMap((event) => (event.outcome?.petId !== undefined ? [event.outcome.petId] : [])));
    for (const petId of Object.keys(PETS)) {
      expect(grantedPetIds).toContain(petId);
    }
  });

  it('フラグを集めきった状態でも、どの章でも3択を埋められる', () => {
    const allTags = events.flatMap((event) => event.outcome?.addTags ?? []);
    for (const chapter of CHAPTERS_TO_CHECK) {
      const count = eligibleEvents(events, { chapter, tags: allTags }).length;
      expect(count).toBeGreaterThanOrEqual(MIN_CANDIDATES);
    }
  });

  // ここから枝分かれの健全性。単なるイベント一覧の話ではなく、
  // 「選んだ結果が本当に後日の選択肢を変えるか」を eligibleEvents 越しに検証する。

  /** outcome.addTags で1つのタグを付与し、そのタグを自分の forbidsTags にも
   *  含めているイベント＝「一度選んだら二度と出ない」設計のもの。 */
  function findSelfClosingEvents(): readonly DailyEvent[] {
    return events.filter((event) => {
      const tag = event.outcome?.addTags?.[0];
      return tag !== undefined && (event.condition.forbidsTags ?? []).includes(tag);
    });
  }

  it('一度きりの出来事は、そのタグを得た後に再び候補に出てこない', () => {
    const selfClosing = findSelfClosingEvents();
    // 検出できなければテスト自体が意味を失うので、ガードが機能しているかも見る。
    expect(selfClosing.length).toBeGreaterThan(0);

    for (const event of selfClosing) {
      const chapter = event.condition.minChapter ?? 1;
      const flagsAfterChoosing = applyOutcome({ chapter, tags: [] }, event);
      const eligibleIds = eligibleEvents(events, flagsAfterChoosing).map((e) => e.id);
      expect(eligibleIds).not.toContain(event.id);
    }
  });

  /**
   * 本線ごとの相互排他の対。データから自動検出せず、id を名指しで固定する。
   *
   * 自動検出（forbidsTags の付け合いを走査する方式）は、片方の forbidsTags を
   * うっかり消してしまう書き間違いに対して無力だった。消えた瞬間その対は
   * 「検出対象」からも一緒に消えるため、テストは何も検出できず素通りしてしまう
   * （実際にこの実装で試し、guardReport から forbidsTags: ['bandit-pact'] を
   * 落としても緑のままになることを確認した）。id 直指定ならその対が
   * 存在すること自体を expect で検査できるので、この抜け道がない。
   */
  const EXCLUSIVE_PAIRS: ReadonlyArray<[string, string]> = [
    ['banditDeal', 'guardReport'],
    ['forestSpiritPray', 'forestClearPath'],
    ['aidSurvivors', 'lootRelic'],
    ['curseLift', 'curseEmbrace'],
  ];

  function findEvent(id: string): DailyEvent {
    const found = events.find((event) => event.id === id);
    if (found === undefined) throw new Error(`イベントが見つからない: ${id}`);
    return found;
  }

  it('相互排他の対は、片方を選ぶともう片方が本当に候補から消える', () => {
    for (const [idA, idB] of EXCLUSIVE_PAIRS) {
      const a = findEvent(idA);
      const b = findEvent(idB);
      const tagA = a.outcome?.addTags?.[0];
      const tagB = b.outcome?.addTags?.[0];
      expect(tagA).toBeDefined();
      expect(tagB).toBeDefined();

      const chapter = Math.max(a.condition.minChapter ?? 1, b.condition.minChapter ?? 1);

      // a を選んだ世界では b が消え、a 自身も一度きりなので消える。
      const flagsAfterA = applyOutcome({ chapter, tags: [] }, a);
      const idsAfterA = eligibleEvents(events, flagsAfterA).map((e) => e.id);
      expect(idsAfterA).not.toContain(idB);
      expect(idsAfterA).not.toContain(idA);

      // 対称に、b を選んだ世界では a が消える。
      const flagsAfterB = applyOutcome({ chapter, tags: [] }, b);
      const idsAfterB = eligibleEvents(events, flagsAfterB).map((e) => e.id);
      expect(idsAfterB).not.toContain(idA);
      expect(idsAfterB).not.toContain(idB);
    }
  });
});

describe('人名マスタの健全性', () => {
  it('酒場に並べる人数より十分多い', () => {
    expect(NAMES.length).toBeGreaterThan(RECRUITS_PER_DAY * 3);
  });

  it('重複していない', () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });
});
