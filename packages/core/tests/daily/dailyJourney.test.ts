import { describe, it, expect } from 'vitest';
import { daySeed, tavernSeed, voteSeed } from '../../src/daily/seed.js';
import { pickEvents, applyOutcome } from '../../src/daily/event.js';
import { closeDay, chapterOf, isBossDay } from '../../src/daily/day.js';
import { rollRecruits } from '../../src/daily/recruit.js';
import { EVENTS } from '../../src/data/events.js';
import { NAMES } from '../../src/data/names.js';
import { JOBS } from '../../src/data/jobs.js';
import type { WorldDay } from '../../src/daily/day.js';
import type { WorldFlags, DailyEvent } from '../../src/daily/event.js';
import type { Vote } from '../../src/daily/vote.js';

const pool = Object.values(EVENTS);
const basicJobs = Object.values(JOBS).filter((job) => job.tier === 'basic').map((job) => job.id);

/** その日の3択を作る。tags を渡さなければ、まだ何も拾っていない世界として開く。 */
function openDay(worldId: string, dayNo: number, tags: readonly string[] = []): WorldDay {
  const options = pickEvents(pool, { chapter: chapterOf(dayNo), tags }, daySeed(worldId, dayNo));
  return { dayNo, optionIds: options.map((event) => event.id), chosenId: null, counts: null, tiebroken: null };
}

describe('日次ループの通し', () => {
  it('その日を開くと3択が出る', () => {
    expect(openDay('world-1', 1).optionIds).toHaveLength(3);
  });

  it('同じ世界の同じ日なら、誰が開いても同じ3択', () => {
    expect(openDay('world-1', 1)).toEqual(openDay('world-1', 1));
  });

  it('別の世界では別の3択になりうる', () => {
    const a = Array.from({ length: 10 }, (_, i) => openDay('world-1', i + 1).optionIds.join());
    const b = Array.from({ length: 10 }, (_, i) => openDay('world-2', i + 1).optionIds.join());
    expect(a).not.toEqual(b);
  });

  it('投票して締めると、多数決の結果が確定する', () => {
    const day = openDay('world-1', 1);
    const votes: Vote[] = [
      { playerId: 'a', optionId: day.optionIds[1] },
      { playerId: 'b', optionId: day.optionIds[1] },
      { playerId: 'c', optionId: day.optionIds[0] },
    ];
    const closed = closeDay(day, votes, voteSeed('world-1', 1));
    expect(closed.chosenId).toBe(day.optionIds[1]);
    expect(closed.counts?.[day.optionIds[1]]).toBe(2);
  });

  it('締め処理が二重に走っても世界は動かない', () => {
    const day = openDay('world-1', 1);
    const votes: Vote[] = [{ playerId: 'a', optionId: day.optionIds[0] }];
    const seed = voteSeed('world-1', 1);
    const once = closeDay(day, votes, seed);
    expect(closeDay(closeDay(once, votes, seed), votes, seed)).toEqual(once);
  });

  it('1人だけでも世界は進む', () => {
    const day = openDay('world-1', 3);
    const closed = closeDay(day, [{ playerId: 'solo', optionId: day.optionIds[2] }], voteSeed('world-1', 3));
    expect(closed.chosenId).toBe(day.optionIds[2]);
    expect(closed.tiebroken).toBe(false);
  });

  it('30日分回しても、毎日3択が出て必ず締まる', () => {
    for (let dayNo = 1; dayNo <= 30; dayNo++) {
      const day = openDay('world-1', dayNo);
      expect(day.optionIds.length).toBeGreaterThan(0);
      const closed = closeDay(day, [], voteSeed('world-1', dayNo));
      expect(closed.chosenId).not.toBeNull();
    }
  });

  it('30日分の選択がフラグに積み上がり、条件つきのイベントが開く', () => {
    // 選んだイベントの結果を翌日のフラグに畳み込みながら30日進める。
    // これをやらないと requiresTags のイベントは永遠に出てこない。
    let flags: WorldFlags = { chapter: chapterOf(1), tags: [] };
    const collected: string[] = [];
    const gatedSeen = new Set<string>();

    for (let dayNo = 1; dayNo <= 30; dayNo++) {
      flags = { chapter: chapterOf(dayNo), tags: flags.tags };

      const options = pickEvents(pool, flags, daySeed('world-1', dayNo));
      expect(options.length).toBeGreaterThan(0);

      for (const option of options) {
        if (option.condition.requiresTags !== undefined) gatedSeen.add(option.id);
      }

      const day: WorldDay = {
        dayNo,
        optionIds: options.map((event) => event.id),
        chosenId: null,
        counts: null,
        tiebroken: null,
      };
      const closed = closeDay(day, [], voteSeed('world-1', dayNo));
      expect(closed.chosenId).not.toBeNull();

      const chosen = options.find((event) => event.id === closed.chosenId);
      expect(chosen).toBeDefined();

      const next = applyOutcome(flags, chosen as DailyEvent);
      for (const tag of next.tags) {
        if (!collected.includes(tag)) collected.push(tag);
      }
      flags = next;
    }

    // 選択の結果としてタグが実際に貯まっている。
    expect(collected.length).toBeGreaterThan(0);
    expect(flags.tags).toEqual(collected);

    // 貯まったタグに守られていたイベントが、実際に3択へ顔を出した。
    expect(gatedSeen.size).toBeGreaterThan(0);
  });

  it('7日ごとにボスの日が来る', () => {
    const bossDays = Array.from({ length: 30 }, (_, i) => i + 1).filter(isBossDay);
    expect(bossDays).toEqual([7, 14, 21, 28]);
  });

  it('酒場の顔ぶれはイベントの3択と相関しない', () => {
    // 「どちらもばらけている」では、二つのシードが同一に潰れた実装でも通ってしまう。
    // 同じ関数を両方のシードで駆動して、出てくる列がずれることを見る。
    const days = 200;

    const eventsByDaySeed: string[] = [];
    const eventsByTavernSeed: string[] = [];
    const rosterByTavernSeed: string[] = [];
    const rosterByDaySeed: string[] = [];

    for (let dayNo = 1; dayNo <= days; dayNo++) {
      const flags = { chapter: chapterOf(dayNo), tags: [] };

      // まずシードそのものが、どの日でも一致しない。
      expect(daySeed('world-1', dayNo)).not.toBe(tavernSeed('world-1', dayNo));

      eventsByDaySeed.push(
        pickEvents(pool, flags, daySeed('world-1', dayNo)).map((e) => e.id).join(),
      );
      eventsByTavernSeed.push(
        pickEvents(pool, flags, tavernSeed('world-1', dayNo)).map((e) => e.id).join(),
      );

      const prefix = `world-1:${dayNo}`;
      rosterByTavernSeed.push(
        rollRecruits(tavernSeed('world-1', dayNo), prefix, NAMES, basicJobs, 15)
          .map((r) => r.name)
          .join(),
      );
      rosterByDaySeed.push(
        rollRecruits(daySeed('world-1', dayNo), prefix, NAMES, basicJobs, 15)
          .map((r) => r.name)
          .join(),
      );
    }

    // 名前空間が潰れていれば、これらは同じ列になる。
    expect(eventsByDaySeed).not.toEqual(eventsByTavernSeed);
    expect(rosterByTavernSeed).not.toEqual(rosterByDaySeed);

    // 潰れていなければ、日ごとの一致もごく一部にとどまる。
    const sameEventDraw = eventsByDaySeed.filter((v, i) => v === eventsByTavernSeed[i]).length;
    const sameRoster = rosterByTavernSeed.filter((v, i) => v === rosterByDaySeed[i]).length;
    expect(sameEventDraw).toBeLessThan(days / 2);
    expect(sameRoster).toBeLessThan(days / 2);
  });

  it('酒場には毎日3人並び、値段がついている', () => {
    for (let dayNo = 1; dayNo <= 10; dayNo++) {
      const roster = rollRecruits(tavernSeed('world-1', dayNo), `world-1:${dayNo}`, NAMES, basicJobs, 15);
      expect(roster).toHaveLength(3);
      for (const recruit of roster) {
        expect(recruit.cost).toBeGreaterThan(0);
        expect(basicJobs).toContain(recruit.jobId);
      }
    }
  });
});
