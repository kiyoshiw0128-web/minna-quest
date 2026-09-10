import { describe, expect, it } from 'vitest';
import { EVENTS, LOCATIONS, ROADS, eventLocation, routeTo, locationDescription, pickAdventureEvents, applyOutcome, chapterOf, matchesCondition } from '../src/index.js';
import type { DailyEvent, LocationId, WorldFlags } from '../src/index.js';

const places = Object.keys(LOCATIONS) as LocationId[];
const pool: readonly DailyEvent[] = Object.values(EVENTS);

describe('物語と街道', () => {
  it('焼けた村・救出・遺物・竜の足跡は同じ地域にあり、旅立ちの村とは別', () => {
    for (const id of ['burnedVillage', 'aidSurvivors', 'lootRelic', 'dragonTracks']) expect(eventLocation(id)).toBe('ruins');
    expect(eventLocation('villageFestival')).toBe('leaf');
    expect(eventLocation('spiritBlessingGift')).toBe(eventLocation('forestSpiritPray'));
    expect(eventLocation('curseLift')).toBe(eventLocation('curseEmbrace'));
  });

  it('全街道が双方向で、全地点に到達できる', () => {
    for (const from of places) {
      for (const next of ROADS[from]) expect(ROADS[next]).toContain(from);
      for (const to of places) {
        const route = routeTo(from, to);
        expect(route[0]).toBe(from);
        expect(route.at(-1)).toBe(to);
        for (let i = 1; i < route.length; i++) expect(ROADS[route[i - 1]!]).toContain(route[i]);
      }
    }
  });

  it('確定した選択で土地の説明が変わり、訪ね直しても状態を忘れない', () => {
    expect(locationDescription('ruins', ['saw-ruins'])).toContain('焼けたアッシュ村');
    expect(locationDescription('ruins', ['saw-ruins', 'survivor-aid'])).toContain('避難');
    expect(locationDescription('ruins', ['saw-ruins', 'relic-looted'])).toContain('持ち去った');
    expect(locationDescription('forest', ['forest-cleared'])).toContain('切り株');
    expect(locationDescription('forest', ['spirit-blessing'])).toContain('祈り');
    expect(locationDescription('keep', ['curse-lifted'])).toContain('呪いは晴れた');
    expect(locationDescription('keep', ['curse-embraced'])).toContain('取り込んだ力');
    expect(locationDescription('leaf', ['saw-ruins'])).not.toContain('焼け');
  });

  it('全地点・全章・分岐を使い切った状態でも3択と移動先が残る', () => {
    const allTags = [...new Set(pool.flatMap((event) => event.outcome?.addTags ?? []))];
    for (const current of places) for (const chapter of [1, 2, 3]) for (const tags of [[], allTags]) for (let seed = 0; seed < 50; seed++) {
      const flags = { chapter, tags };
      const options = pickAdventureEvents(pool, flags, seed, current);
      expect(options).toHaveLength(3);
      expect(new Set(options.map((event) => event.id)).size).toBe(3);
      expect(options.some((event) => eventLocation(event.id) !== current)).toBe(true);
      for (const event of options) {
        expect(matchesCondition(event.condition, flags)).toBe(true);
        expect([current, ...ROADS[current]]).toContain(eventLocation(event.id));
      }
    }
  });

  it('100日間の旅を複数の選び方で進めても飛び地・条件違反・行き詰まりがない', () => {
    for (let play = 0; play < 20; play++) {
      let current: LocationId = 'leaf';
      let flags: WorldFlags = { chapter: 1, tags: [] };
      for (let day = 1; day <= 100; day++) {
        flags = { ...flags, chapter: chapterOf(day) };
        const options = pickAdventureEvents(pool, flags, play * 1000 + day, current);
        expect(options).toHaveLength(3);
        expect(pickAdventureEvents(pool, flags, play * 1000 + day, current)).toEqual(options);
        const chosen = options[(play + day) % 3]!;
        const next = eventLocation(chosen.id)!;
        expect([current, ...ROADS[current]]).toContain(next);
        expect(matchesCondition(chosen.condition, flags)).toBe(true);
        flags = applyOutcome(flags, chosen);
        current = next;
      }
    }
  });
});

describe('連続依頼の進行', () => {
  it('一度きりの依頼戦はボス日に提示しない', () => {
    for (const current of places) for (let seed = 0; seed < 30; seed++) {
      const flags = { chapter: 3, tags: ['q-mill-2', 'q-herb-2', 'q-caravan-2', 'q-beacon-2', 'q-stars-2'] };
      for (const event of pickAdventureEvents(pool, flags, seed, current, 21)) expect(event.victoryTag).toBeUndefined();
    }
  });
});
