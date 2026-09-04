# 日次ロジック 実装計画（段階3a）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「毎日みんなが投票し、多数決で世界のルートが決まる」の中身を、Worker も D1 も使わない純関数として動かす。

**Architecture:** `packages/core/src/daily/` に置く。段階1・2と同じ規律 — 依存ゼロ、状態は不変、そして**乱数は使うが決定論的**。シード付き乱数を `(seed, index)` から値を引く純関数として作り、イベント抽選・投票のタイブレーク・酒場の顔ぶれをすべてそこから導く。同じシードなら誰が何度計算しても同じ結果になる。

**Tech Stack:** TypeScript 5.6 / Vitest 2 / pnpm workspace。`packages/core` は実行時依存ゼロ。

**Spec:** `docs/superpowers/specs/2026-09-03-minna-quest-design.md`（5章が主、4.4が雇用市場）

## この計画の範囲

仕様書5.2〜5.4、5.6、および4.4の**純ロジック部分**。

**含まれないもの（段階3bに送る）:**
- Cloudflare Worker、D1、Cron Trigger。この計画は「締めるとどうなるか」を
  関数として書くだけで、「JST 05:00 に誰が呼ぶか」は扱わない
- 締め処理の冪等性のうち、**DB トランザクションに関わる部分**。
  `closeDay` が二重に呼ばれても結果が変わらないことはここで保証するが、
  複数日を溜めて順に処理する取り戻しは Worker 側の仕事
- 戦闘報酬の量（誰がいくら経験値をもらうか）
- ボス討伐の貢献記録（誰が倒したか、初撃破の称号）。永続化が要るので段階4

## 乱数についての重要な但し書き

段階1・2の Global Constraints は「乱数を使わない」だった。**この計画から
`packages/core/src/daily/` に限り、シード付き乱数を使う。** ただし性質は変わらない:

- `Math.random` / `Date.now` / `crypto` は引き続き**禁止**
- 使うのは `(seed, index)` を受け取って値を返す**純関数**だけ。隠れた状態を持つ
  ジェネレータは作らない
- したがって同じ入力からは常に同じ出力が出る。「なぜこの選択肢が出たか」を
  後から再現できる、という仕様書5.3の要求はこれで満たされる
- **`packages/core/src/battle/` は引き続き乱数ゼロ。** 戦闘に乱数を持ち込まない

## Global Constraints

- `packages/core` に **実行時依存を入れない**。devDependencies は vitest と typescript のみ
- `Math.random`、`Date.now`、`crypto` の呼び出しは禁止（上の但し書きを参照）
- **状態を破壊的に変更しない。** 引数で受け取ったオブジェクトと配列は変更しない
- 金額・レベル・票数はすべて整数
- マスタデータは `packages/core/src/data/` に TypeScript の定数として置き、
  `as const satisfies` で凍結する。配列フィールドは型側で `readonly` にする
- **`{} as Record<...>` のような型アサーションでオブジェクトを組み立てない。**
  項目が増えたときにコンパイラが検知できなくなる。明示的なオブジェクトリテラルで書く
- TypeScript は `strict: true`
- import は拡張子 `.js` 付き。型のみの import は `import type`、型の再 export は `export type`
- コミットは `<type>: <description>` 形式。本文末尾に
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- テストは `corepack pnpm --filter @mq/core test`、型検査は `corepack pnpm --filter @mq/core typecheck`

## 既存の資産（前提）

```
battle/types.ts        StatBlock
progression/types.ts   Grade / Aptitude / JobId / Character
data/jobs.ts           JOBS（基本6・上級3）
data/enemies.ts        ENEMIES / BALGOS
```

---

## ファイル構成

```
packages/core/src/daily/
  rng.ts       hashString / randomAt / intAt / drawWithout
  seed.ts      daySeed / tavernSeed
  event.ts     イベントの型・出現条件・抽選
  vote.ts      投票の集計とタイブレーク
  day.ts       章・ボス日・その日を締める
  recruit.ts   酒場の顔ぶれと雇用コスト
packages/core/src/data/
  events.ts    イベントプール
  names.ts     人名プール
packages/core/tests/daily/*.test.ts
```

`rng.ts` は乱数のことしか知らない。`event.ts` は投票を知らない。`day.ts` が
両者を束ねる唯一の場所。この向きにしておくと、各モジュールを単体で検算できる。

---

### Task 1: シード付き乱数

**Files:**
- Create: `packages/core/src/daily/rng.ts`
- Test: `packages/core/tests/daily/rng.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `hashString(input: string): number`, `randomAt(seed: number, index: number): number`, `intAt(seed: number, index: number, maxExclusive: number): number`, `drawWithout<T>(seed: number, items: readonly T[], count: number): readonly T[]`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashString, randomAt, intAt, drawWithout } from '../../src/daily/rng.js';

describe('hashString', () => {
  it('同じ文字列からは常に同じ値が出る', () => {
    expect(hashString('world-1:day:5')).toBe(hashString('world-1:day:5'));
  });

  it('違う文字列からは違う値が出る', () => {
    expect(hashString('world-1:day:5')).not.toBe(hashString('world-1:day:6'));
  });

  it('1文字違うだけで大きく変わる', () => {
    const a = hashString('abc');
    const b = hashString('abd');
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  it('32bit の符号なし整数を返す', () => {
    for (const input of ['', 'a', 'world-1:day:9999', '日本語も通す']) {
      const value = hashString(input);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('randomAt', () => {
  it('同じ (seed, index) からは常に同じ値が出る', () => {
    expect(randomAt(12345, 0)).toBe(randomAt(12345, 0));
  });

  it('index が違えば違う値が出る', () => {
    expect(randomAt(12345, 0)).not.toBe(randomAt(12345, 1));
  });

  it('seed が違えば違う値が出る', () => {
    expect(randomAt(12345, 0)).not.toBe(randomAt(54321, 0));
  });

  it('0以上1未満に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const value = randomAt(777, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('偏りが極端でない（200回の平均が0.5前後）', () => {
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += randomAt(999, i);
    const mean = sum / 200;
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });
});

describe('intAt', () => {
  it('0以上 maxExclusive 未満の整数を返す', () => {
    for (let i = 0; i < 200; i++) {
      const value = intAt(42, i, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it('200回引けば5つの値が全部出る', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(intAt(42, i, 5));
    expect(seen.size).toBe(5);
  });

  it('maxExclusive が1なら常に0', () => {
    expect(intAt(42, 7, 1)).toBe(0);
  });

  it('maxExclusive が0以下なら投げる', () => {
    expect(() => intAt(42, 0, 0)).toThrow('maxExclusive must be positive: 0');
  });
});

describe('drawWithout', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('指定した個数だけ引く', () => {
    expect(drawWithout(1, items, 3)).toHaveLength(3);
  });

  it('同じものを二度引かない', () => {
    const drawn = drawWithout(1, items, 3);
    expect(new Set(drawn).size).toBe(3);
  });

  it('引いたものはすべて元の集合に含まれる', () => {
    for (const value of drawWithout(1, items, 3)) {
      expect(items).toContain(value);
    }
  });

  it('同じシードなら同じ並びが出る', () => {
    expect(drawWithout(1, items, 3)).toEqual(drawWithout(1, items, 3));
  });

  it('シードを変えれば複数の並びが現れる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(drawWithout(seed, items, 3).join());
    expect(seen.size).toBeGreaterThan(1);
  });

  it('要求が集合より多ければ全部返す', () => {
    expect(drawWithout(1, items, 99)).toHaveLength(5);
  });

  it('空の集合からは空を返す', () => {
    expect(drawWithout(1, [], 3)).toEqual([]);
  });

  it('元の配列を並べ替えない', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    drawWithout(1, input, 3);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/rng.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/rng.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/rng.ts`:

```ts
/**
 * 決定論的な擬似乱数。
 *
 * 状態を持つジェネレータではなく、(seed, index) から値を引く純関数にしてある。
 * 同じ組は常に同じ値を返し、途中の任意の位置から引き直せる。
 * これにより「なぜこの選択肢が出たか」を後から誰でも再現できる。
 *
 * Math.random / Date.now / crypto は使わない。
 */

const UINT32 = 0x100000000;

/** 文字列を 32bit 符号なし整数に潰す（FNV-1a）。 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** seed と index から [0, 1) の値を返す（splitmix32 の混合）。 */
export function randomAt(seed: number, index: number): number {
  let x = (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return x / UINT32;
}

/** seed と index から 0 以上 maxExclusive 未満の整数を返す。 */
export function intAt(seed: number, index: number, maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error(`maxExclusive must be positive: ${maxExclusive}`);
  }
  return Math.floor(randomAt(seed, index) * maxExclusive);
}

/**
 * 非復元抽出。items から count 個を重複なく引く。
 * items が count 以下ならすべてを（並べ替えて）返す。
 *
 * 内部で作業用の複製を切り詰めるが、渡された配列には触れない。
 */
export function drawWithout<T>(
  seed: number,
  items: readonly T[],
  count: number,
): readonly T[] {
  const pool = [...items];
  const taken: T[] = [];
  const draws = Math.min(count, pool.length);

  for (let i = 0; i < draws; i++) {
    const at = intAt(seed, i, pool.length);
    taken.push(pool[at]);
    pool.splice(at, 1);
  }

  return taken;
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: 禁止された乱数源を使っていないことを確認する**

Run: `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/daily packages/core/tests/daily
git commit -m "feat: シード付きの決定論的な乱数

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: シードの導出

**Files:**
- Create: `packages/core/src/daily/seed.ts`
- Test: `packages/core/tests/daily/seed.test.ts`

**Interfaces:**
- Consumes: `hashString`（Task 1）
- Produces: `daySeed(worldId: string, dayNo: number): number`, `tavernSeed(worldId: string, dayNo: number): number`

**設計の要点:** イベント抽選と酒場の顔ぶれで**別の名前空間**を使う。同じシードから
両方を引くと、たとえば「イベントAが出た日は必ず戦士が並ぶ」のような相関が生まれ、
プレイヤーに読まれてしまう。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { daySeed, tavernSeed } from '../../src/daily/seed.js';

describe('daySeed', () => {
  it('同じ世界の同じ日からは常に同じシードが出る', () => {
    expect(daySeed('world-1', 5)).toBe(daySeed('world-1', 5));
  });

  it('日が違えばシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(daySeed('world-1', 6));
  });

  it('世界が違えばシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(daySeed('world-2', 5));
  });
});

describe('tavernSeed', () => {
  it('同じ世界の同じ日からは常に同じシードが出る', () => {
    expect(tavernSeed('world-1', 5)).toBe(tavernSeed('world-1', 5));
  });

  it('日が違えばシードが違う', () => {
    expect(tavernSeed('world-1', 5)).not.toBe(tavernSeed('world-1', 6));
  });
});

describe('名前空間の分離', () => {
  it('同じ世界・同じ日でも、イベント用と酒場用でシードが違う', () => {
    expect(daySeed('world-1', 5)).not.toBe(tavernSeed('world-1', 5));
  });

  it('どの日でも両者が一致しない', () => {
    for (let dayNo = 1; dayNo <= 50; dayNo++) {
      expect(daySeed('world-1', dayNo)).not.toBe(tavernSeed('world-1', dayNo));
    }
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/seed.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/seed.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/seed.ts`:

```ts
import { hashString } from './rng.js';

/**
 * その日のイベント抽選と、投票が同数だったときのタイブレークに使うシード。
 * 世界IDと日数から決まるので、後から誰でも同じ値を再現できる。
 */
export function daySeed(worldId: string, dayNo: number): number {
  return hashString(`${worldId}:day:${dayNo}`);
}

/**
 * その日の酒場に並ぶ顔ぶれを決めるシード。
 * イベント抽選と名前空間を分けてあるのは、両者に相関が出ると
 * 「この選択肢が出た日は必ずこの職業が並ぶ」と読まれてしまうため。
 */
export function tavernSeed(worldId: string, dayNo: number): number {
  return hashString(`${worldId}:tavern:${dayNo}`);
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/daily/seed.ts packages/core/tests/daily/seed.test.ts
git commit -m "feat: 世界と日数からのシード導出

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: イベントの型・出現条件・抽選

**Files:**
- Create: `packages/core/src/daily/event.ts`
- Test: `packages/core/tests/daily/event.test.ts`

**Interfaces:**
- Consumes: `drawWithout`（Task 1）
- Produces: `EventKind`, `WorldFlags`, `EventCondition`, `EventOutcome`, `DailyEvent`, `OPTIONS_PER_DAY` (3), `matchesCondition(condition, flags): boolean`, `eligibleEvents(pool, flags): readonly DailyEvent[]`, `pickEvents(pool, flags, seed): readonly DailyEvent[]`

**設計の要点:** 出現条件に重み付けを入れない。仕様書5.3は「条件を満たすものから
シードで3つ引く」としか言っておらず、重みは今のところ誰も必要としていない。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/event.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  matchesCondition,
  eligibleEvents,
  pickEvents,
  OPTIONS_PER_DAY,
} from '../../src/daily/event.js';
import type { DailyEvent, WorldFlags } from '../../src/daily/event.js';

const flags: WorldFlags = { chapter: 2, tags: ['met-elder'] };

function event(id: string, condition: DailyEvent['condition'] = {}): DailyEvent {
  return { id, name: id, kind: 'story', condition, outcome: { gold: 10 } };
}

describe('matchesCondition', () => {
  it('条件が空なら常に通る', () => {
    expect(matchesCondition({}, flags)).toBe(true);
  });

  it('最低の章に届いていなければ弾く', () => {
    expect(matchesCondition({ minChapter: 3 }, flags)).toBe(false);
  });

  it('最低の章に届いていれば通る', () => {
    expect(matchesCondition({ minChapter: 2 }, flags)).toBe(true);
  });

  it('最大の章を超えていれば弾く', () => {
    expect(matchesCondition({ maxChapter: 1 }, flags)).toBe(false);
  });

  it('章の範囲に収まっていれば通る', () => {
    expect(matchesCondition({ minChapter: 1, maxChapter: 3 }, flags)).toBe(true);
  });

  it('必要なフラグを持っていれば通る', () => {
    expect(matchesCondition({ requiresTags: ['met-elder'] }, flags)).toBe(true);
  });

  it('必要なフラグを1つでも欠いていれば弾く', () => {
    expect(matchesCondition({ requiresTags: ['met-elder', 'has-map'] }, flags)).toBe(false);
  });

  it('禁止フラグを持っていれば弾く', () => {
    expect(matchesCondition({ forbidsTags: ['met-elder'] }, flags)).toBe(false);
  });

  it('禁止フラグを持っていなければ通る', () => {
    expect(matchesCondition({ forbidsTags: ['has-map'] }, flags)).toBe(true);
  });
});

describe('eligibleEvents', () => {
  const pool: DailyEvent[] = [
    event('always'),
    event('ch3only', { minChapter: 3 }),
    event('needsElder', { requiresTags: ['met-elder'] }),
    event('bannedByElder', { forbidsTags: ['met-elder'] }),
  ];

  it('条件を満たすものだけを返す', () => {
    expect(eligibleEvents(pool, flags).map((e) => e.id)).toEqual(['always', 'needsElder']);
  });

  it('元のプールを変更しない', () => {
    eligibleEvents(pool, flags);
    expect(pool).toHaveLength(4);
  });
});

describe('pickEvents', () => {
  const pool: DailyEvent[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => event(id));

  it('3つ引く', () => {
    expect(pickEvents(pool, flags, 1)).toHaveLength(OPTIONS_PER_DAY);
  });

  it('同じものを二度出さない', () => {
    const picked = pickEvents(pool, flags, 1);
    expect(new Set(picked.map((e) => e.id)).size).toBe(OPTIONS_PER_DAY);
  });

  it('同じシードなら全員が同じ3択を見る', () => {
    expect(pickEvents(pool, flags, 7)).toEqual(pickEvents(pool, flags, 7));
  });

  it('日が変われば（シードが変われば）3択も変わる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(pickEvents(pool, flags, seed).map((e) => e.id).join());
    expect(seen.size).toBeGreaterThan(1);
  });

  it('条件を満たさないイベントは出さない', () => {
    const gated: DailyEvent[] = [
      event('ok1'),
      event('ok2'),
      event('locked', { minChapter: 9 }),
    ];
    const picked = pickEvents(gated, flags, 3).map((e) => e.id);
    expect(picked).not.toContain('locked');
  });

  it('候補が3つに満たなければあるだけ返す', () => {
    const thin: DailyEvent[] = [event('only')];
    expect(pickEvents(thin, flags, 1)).toHaveLength(1);
  });

  it('OPTIONS_PER_DAY は3', () => {
    expect(OPTIONS_PER_DAY).toBe(3);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/event.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/event.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/event.ts`:

```ts
import { drawWithout } from './rng.js';

/** 1日に提示する選択肢の数。 */
export const OPTIONS_PER_DAY = 3;

/** battle は雑魚戦、story は戦闘を伴わない出来事。 */
export type EventKind = 'battle' | 'story';

/** 世界の状態。イベントの出現条件はこれを見る。 */
export type WorldFlags = {
  readonly chapter: number;
  /** 通ってきたルートで獲得したフラグ */
  readonly tags: readonly string[];
};

/** 出現条件。指定しなかった項目は制約しない。 */
export type EventCondition = {
  readonly minChapter?: number;
  readonly maxChapter?: number;
  readonly requiresTags?: readonly string[];
  readonly forbidsTags?: readonly string[];
};

/** 非戦闘イベントを選んだ結果。 */
export type EventOutcome = {
  readonly gold?: number;
  readonly addTags?: readonly string[];
  readonly petId?: string;
};

export type DailyEvent = {
  readonly id: string;
  readonly name: string;
  readonly kind: EventKind;
  /** kind が 'battle' のとき、戦う相手のID */
  readonly enemyId?: string;
  /** kind が 'story' のとき、選んだ結果 */
  readonly outcome?: EventOutcome;
  readonly condition: EventCondition;
};

export function matchesCondition(condition: EventCondition, flags: WorldFlags): boolean {
  if (condition.minChapter !== undefined && flags.chapter < condition.minChapter) return false;
  if (condition.maxChapter !== undefined && flags.chapter > condition.maxChapter) return false;
  if (condition.requiresTags?.some((tag) => !flags.tags.includes(tag))) return false;
  if (condition.forbidsTags?.some((tag) => flags.tags.includes(tag))) return false;
  return true;
}

/** 今の世界の状態で出現しうるイベント。プールの並び順は保つ。 */
export function eligibleEvents(
  pool: readonly DailyEvent[],
  flags: WorldFlags,
): readonly DailyEvent[] {
  return pool.filter((event) => matchesCondition(event.condition, flags));
}

/**
 * その日の3択を引く。
 * シードが共通なので全員が同じ3択を見る。決定論なので
 * 「なぜこの選択肢が出たか」を後から再現できる。
 * 候補が3つに満たなければあるだけ返す。
 */
export function pickEvents(
  pool: readonly DailyEvent[],
  flags: WorldFlags,
  seed: number,
): readonly DailyEvent[] {
  return drawWithout(seed, eligibleEvents(pool, flags), OPTIONS_PER_DAY);
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/daily/event.ts packages/core/tests/daily/event.test.ts
git commit -m "feat: イベントの出現条件とその日の3択の抽選

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 投票の集計とタイブレーク

**Files:**
- Create: `packages/core/src/daily/vote.ts`
- Test: `packages/core/tests/daily/vote.test.ts`

**Interfaces:**
- Consumes: `intAt`（Task 1）
- Produces: `Vote = { readonly playerId: string; readonly optionId: string }`, `Tally = { readonly winner: string; readonly counts: Readonly<Record<string, number>>; readonly tiebroken: boolean }`, `tallyVotes(votes, options, seed): Tally`

**設計の要点:** 同じプレイヤーが複数回投票していたら**最後の1票**だけを数える。
提示されていない選択肢への票は無視する。同数ならシードで決める — サイコロを
振らないので後から検証できる（仕様書5.2）。誰も投票しなければ全選択肢が0票で
並ぶので、そのままタイブレークに落ちる。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/vote.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tallyVotes } from '../../src/daily/vote.js';
import type { Vote } from '../../src/daily/vote.js';

const options = ['forest', 'cave', 'town'];

function vote(playerId: string, optionId: string): Vote {
  return { playerId, optionId };
}

describe('tallyVotes - 多数決', () => {
  it('最多得票の選択肢が勝つ', () => {
    const votes = [vote('a', 'forest'), vote('b', 'forest'), vote('c', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.winner).toBe('forest');
    expect(tally.tiebroken).toBe(false);
  });

  it('票数を選択肢ごとに返す', () => {
    const votes = [vote('a', 'forest'), vote('b', 'forest'), vote('c', 'cave')];
    expect(tallyVotes(votes, options, 1).counts).toEqual({ forest: 2, cave: 1, town: 0 });
  });

  it('1人でも成立する', () => {
    const tally = tallyVotes([vote('a', 'town')], options, 1);
    expect(tally.winner).toBe('town');
    expect(tally.tiebroken).toBe(false);
  });
});

describe('tallyVotes - 票の扱い', () => {
  it('同じ人が2回投票したら最後の1票だけ数える', () => {
    const votes = [vote('a', 'forest'), vote('a', 'cave'), vote('b', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.counts).toEqual({ forest: 0, cave: 2, town: 0 });
    expect(tally.winner).toBe('cave');
  });

  it('提示されていない選択肢への票は無視する', () => {
    const votes = [vote('a', 'moon'), vote('b', 'forest')];
    const tally = tallyVotes(votes, options, 1);
    expect(tally.counts).toEqual({ forest: 1, cave: 0, town: 0 });
  });

  it('提示外に投票し直しても、前の有効票は取り消されない', () => {
    const votes = [vote('a', 'forest'), vote('a', 'moon')];
    expect(tallyVotes(votes, options, 1).counts.forest).toBe(1);
  });
});

describe('tallyVotes - タイブレーク', () => {
  it('同数ならシードで決まり、tiebroken が立つ', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    const tally = tallyVotes(votes, options, 1);
    expect(['forest', 'cave']).toContain(tally.winner);
    expect(tally.tiebroken).toBe(true);
  });

  it('同じシードなら同じ結果になる', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    expect(tallyVotes(votes, options, 42)).toEqual(tallyVotes(votes, options, 42));
  });

  it('シードが違えば結果が変わりうる', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    const winners = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      winners.add(tallyVotes(votes, options, seed).winner);
    }
    expect(winners.size).toBe(2);
  });

  it('タイブレークは同数の選択肢の中からしか選ばない', () => {
    const votes = [vote('a', 'forest'), vote('b', 'cave')];
    for (let seed = 0; seed < 30; seed++) {
      expect(tallyVotes(votes, options, seed).winner).not.toBe('town');
    }
  });

  it('誰も投票しなければ全部0票で並び、シードで決まる', () => {
    const tally = tallyVotes([], options, 5);
    expect(tally.counts).toEqual({ forest: 0, cave: 0, town: 0 });
    expect(options).toContain(tally.winner);
    expect(tally.tiebroken).toBe(true);
  });
});

describe('tallyVotes - 異常系', () => {
  it('選択肢が空なら投げる', () => {
    expect(() => tallyVotes([], [], 1)).toThrow('no options to tally');
  });

  it('元の配列を変更しない', () => {
    const votes = [vote('a', 'forest')];
    tallyVotes(votes, options, 1);
    expect(votes).toHaveLength(1);
    expect(options).toEqual(['forest', 'cave', 'town']);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/vote.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/vote.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/vote.ts`:

```ts
import { intAt } from './rng.js';

export type Vote = {
  readonly playerId: string;
  readonly optionId: string;
};

export type Tally = {
  readonly winner: string;
  readonly counts: Readonly<Record<string, number>>;
  /** 同数だったためシードで決めた場合に true */
  readonly tiebroken: boolean;
};

/**
 * 投票を集計して、その日に通る選択肢を決める。
 *
 * - 同じプレイヤーが複数回投票していたら、最後の1票だけを数える
 * - 提示されていない選択肢への票は無視する
 * - 同数ならシードで決める。サイコロを振らないので後から検証できる
 * - 誰も投票しなければ全選択肢が0票で並び、そのままタイブレークに落ちる
 */
export function tallyVotes(
  votes: readonly Vote[],
  options: readonly string[],
  seed: number,
): Tally {
  if (options.length === 0) throw new Error('no options to tally');

  const latest = new Map<string, string>();
  for (const vote of votes) {
    if (options.includes(vote.optionId)) latest.set(vote.playerId, vote.optionId);
  }

  const counts: Record<string, number> = {};
  for (const option of options) counts[option] = 0;
  for (const optionId of latest.values()) counts[optionId] += 1;

  const top = Math.max(...options.map((option) => counts[option]));
  const leaders = options.filter((option) => counts[option] === top);
  const tiebroken = leaders.length > 1;

  return {
    winner: tiebroken ? leaders[intAt(seed, 0, leaders.length)] : leaders[0],
    counts,
    tiebroken,
  };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/daily/vote.ts packages/core/tests/daily/vote.test.ts
git commit -m "feat: 投票の集計と決定論的なタイブレーク

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 章・ボス日・その日を締める

**Files:**
- Create: `packages/core/src/daily/day.ts`
- Test: `packages/core/tests/daily/day.test.ts`

**Interfaces:**
- Consumes: `Vote`/`tallyVotes`（Task 4）
- Produces: `BOSS_INTERVAL` (7), `isBossDay(dayNo): boolean`, `chapterOf(dayNo): number`, `WorldDay = { readonly dayNo: number; readonly optionIds: readonly string[]; readonly chosenId: string | null; readonly counts: Readonly<Record<string, number>> | null; readonly tiebroken: boolean | null }`, `closeDay(day, votes, seed): WorldDay`

**設計の要点:** `closeDay` は**冪等**でなければならない。締め処理が失敗して二重に
呼ばれても結果が変わらないこと（仕様書5.2）。すでに `chosenId` が入っている日は
そのまま返す。複数日を溜めて順に処理する取り戻しは Worker 側（段階3b）の仕事で、
ここでは1日分の締めが安全であることだけを保証する。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/day.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isBossDay, chapterOf, closeDay, BOSS_INTERVAL } from '../../src/daily/day.js';
import type { WorldDay } from '../../src/daily/day.js';
import type { Vote } from '../../src/daily/vote.js';

function day(over: Partial<WorldDay> = {}): WorldDay {
  return {
    dayNo: 3,
    optionIds: ['forest', 'cave', 'town'],
    chosenId: null,
    counts: null,
    tiebroken: null,
    ...over,
  };
}

describe('isBossDay', () => {
  it('7日ごとがボスの日', () => {
    expect(isBossDay(7)).toBe(true);
    expect(isBossDay(14)).toBe(true);
    expect(isBossDay(21)).toBe(true);
  });

  it('それ以外はボスの日ではない', () => {
    for (const dayNo of [1, 2, 3, 4, 5, 6, 8, 13]) {
      expect(isBossDay(dayNo)).toBe(false);
    }
  });

  it('0日目はボスの日ではない', () => {
    expect(isBossDay(0)).toBe(false);
  });

  it('間隔は7', () => {
    expect(BOSS_INTERVAL).toBe(7);
  });
});

describe('chapterOf', () => {
  it('1日目から7日目までが第1章', () => {
    for (let dayNo = 1; dayNo <= 7; dayNo++) {
      expect(chapterOf(dayNo)).toBe(1);
    }
  });

  it('8日目から14日目までが第2章', () => {
    expect(chapterOf(8)).toBe(2);
    expect(chapterOf(14)).toBe(2);
  });

  it('章はボスの日で切り替わらず、その翌日から変わる', () => {
    expect(chapterOf(7)).toBe(chapterOf(1));
    expect(chapterOf(8)).not.toBe(chapterOf(7));
  });
});

describe('closeDay', () => {
  const votes: Vote[] = [
    { playerId: 'a', optionId: 'forest' },
    { playerId: 'b', optionId: 'forest' },
    { playerId: 'c', optionId: 'cave' },
  ];

  it('多数決の結果を確定させる', () => {
    const closed = closeDay(day(), votes, 1);
    expect(closed.chosenId).toBe('forest');
  });

  it('票数も記録する', () => {
    expect(closeDay(day(), votes, 1).counts).toEqual({ forest: 2, cave: 1, town: 0 });
  });

  it('日付と選択肢はそのまま持ち越す', () => {
    const closed = closeDay(day(), votes, 1);
    expect(closed.dayNo).toBe(3);
    expect(closed.optionIds).toEqual(['forest', 'cave', 'town']);
  });

  it('二重に締めても結果が変わらない', () => {
    const once = closeDay(day(), votes, 1);
    const twice = closeDay(once, votes, 1);
    expect(twice).toEqual(once);
  });

  it('締め済みの日は、あとから票が増えても動かない', () => {
    const once = closeDay(day(), votes, 1);
    const laterVotes: Vote[] = [...votes, { playerId: 'd', optionId: 'cave' }, { playerId: 'e', optionId: 'cave' }];
    expect(closeDay(once, laterVotes, 1).chosenId).toBe('forest');
  });

  it('締め済みの日は同一のオブジェクトをそのまま返す', () => {
    const once = closeDay(day(), votes, 1);
    expect(closeDay(once, votes, 1)).toBe(once);
  });

  it('同数で決まったかどうかも記録する', () => {
    expect(closeDay(day(), votes, 1).tiebroken).toBe(false);
    const split: Vote[] = [{ playerId: 'a', optionId: 'forest' }, { playerId: 'b', optionId: 'cave' }];
    expect(closeDay(day(), split, 1).tiebroken).toBe(true);
  });

  it('元の日を書き換えない', () => {
    const before = day();
    closeDay(before, votes, 1);
    expect(before.chosenId).toBeNull();
    expect(before.counts).toBeNull();
    expect(before.tiebroken).toBeNull();
  });

  it('誰も投票しなくても締まる', () => {
    const closed = closeDay(day(), [], 5);
    expect(closed.chosenId).not.toBeNull();
    expect(closed.optionIds).toContain(closed.chosenId);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/day.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/day.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/day.ts`:

```ts
import { tallyVotes } from './vote.js';
import type { Vote } from './vote.js';

/** 章ボスが来る間隔。 */
export const BOSS_INTERVAL = 7;

/** 7日ごとが章ボスの日。 */
export function isBossDay(dayNo: number): boolean {
  return dayNo > 0 && dayNo % BOSS_INTERVAL === 0;
}

/** その日が属する章。1日目から7日目までが第1章。 */
export function chapterOf(dayNo: number): number {
  return Math.floor((dayNo - 1) / BOSS_INTERVAL) + 1;
}

export type WorldDay = {
  readonly dayNo: number;
  /** その日に提示された選択肢 */
  readonly optionIds: readonly string[];
  /** 締め済みなら確定した選択肢。未締めなら null */
  readonly chosenId: string | null;
  /** 締め済みなら選択肢ごとの票数。未締めなら null */
  readonly counts: Readonly<Record<string, number>> | null;
  /** 締め済みで、同数だったためシードで決めた場合に true。未締めなら null */
  readonly tiebroken: boolean | null;
};

/**
 * その日を締める。
 *
 * **冪等。** 締め処理が失敗して二重に呼ばれても結果が変わらないことが必須で、
 * すでに締まっている日は手を触れずにそのまま返す。あとから票が増えても
 * 確定した選択肢は動かない。
 */
export function closeDay(day: WorldDay, votes: readonly Vote[], seed: number): WorldDay {
  if (day.chosenId !== null) return day;

  const tally = tallyVotes(votes, day.optionIds, seed);
  return { ...day, chosenId: tally.winner, counts: tally.counts, tiebroken: tally.tiebroken };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/daily/day.ts packages/core/tests/daily/day.test.ts
git commit -m "feat: 章とボス日の判定、冪等な締め処理

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 酒場の顔ぶれと雇用コスト

**Files:**
- Create: `packages/core/src/daily/recruit.ts`
- Test: `packages/core/tests/daily/recruit.test.ts`

**Interfaces:**
- Consumes: `intAt`/`drawWithout`（Task 1）、`Aptitude`/`Grade`/`JobId`（`progression/types.js`）
- Produces: `RECRUITS_PER_DAY` (3), `Recruit`, `aptitudeQuality(aptitude): number`, `recruitCost(adventureLevel, aptitude): number`, `rollRecruits(seed, names, jobIds, maxLevel): readonly Recruit[]`

**設計の要点:** 仕様書4.4の「安いけど Lv3 の素質A」と「高いけど Lv15 の素質C」が
天秤になるように、値段は冒険レベルに比例させ、素質では最大2倍までしか上がらない
ようにする。こうすると素質の高い低レベル人材のほうが安く、育てる日数がそのまま
コストになる。

素質は7項目を**明示的なオブジェクトリテラル**で組む。`{} as Record<...>` を使うと
`StatBlock` に項目が増えたときにコンパイラが検知できなくなる。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/daily/recruit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  aptitudeQuality,
  recruitCost,
  rollRecruits,
  RECRUITS_PER_DAY,
} from '../../src/daily/recruit.js';
import type { Aptitude } from '../../src/progression/types.js';

const allC: Aptitude = { maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C' };
const allA: Aptitude = { maxHp: 'A', maxMp: 'A', atk: 'A', def: 'A', mat: 'A', mdf: 'A', spd: 'A' };
const allE: Aptitude = { maxHp: 'E', maxMp: 'E', atk: 'E', def: 'E', mat: 'E', mdf: 'E', spd: 'E' };

const names = ['アルド', 'ベラ', 'カイ', 'ディナ', 'エリク', 'フィナ'];
const jobIds = ['warrior', 'mage', 'priest'];

describe('aptitudeQuality', () => {
  it('全項目Aで28', () => {
    expect(aptitudeQuality(allA)).toBe(28);
  });

  it('全項目Eで0', () => {
    expect(aptitudeQuality(allE)).toBe(0);
  });

  it('全項目Cで14', () => {
    expect(aptitudeQuality(allC)).toBe(14);
  });
});

describe('recruitCost', () => {
  it('冒険レベルに比例する', () => {
    expect(recruitCost(10, allC)).toBe(recruitCost(5, allC) * 2);
  });

  it('素質が高いほど高い', () => {
    expect(recruitCost(10, allA)).toBeGreaterThan(recruitCost(10, allC));
    expect(recruitCost(10, allC)).toBeGreaterThan(recruitCost(10, allE));
  });

  it('素質では最大2倍までしか上がらない', () => {
    expect(recruitCost(10, allA)).toBe(recruitCost(10, allE) * 2);
  });

  it('素質の高い低レベル人材のほうが、素質の低い高レベル人材より安い', () => {
    expect(recruitCost(3, allA)).toBeLessThan(recruitCost(15, allC));
  });

  it('整数を返す', () => {
    for (let level = 1; level <= 20; level++) {
      expect(Number.isInteger(recruitCost(level, allC))).toBe(true);
    }
  });
});

describe('rollRecruits', () => {
  it('3人並ぶ', () => {
    expect(rollRecruits(1, names, jobIds, 15)).toHaveLength(RECRUITS_PER_DAY);
  });

  it('同じシードなら全員が同じ顔ぶれを見る', () => {
    expect(rollRecruits(7, names, jobIds, 15)).toEqual(rollRecruits(7, names, jobIds, 15));
  });

  it('日が変われば顔ぶれも変わる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      seen.add(rollRecruits(seed, names, jobIds, 15).map((r) => r.name).join());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('同じ名前が2人並ばない', () => {
    for (let seed = 0; seed < 30; seed++) {
      const roster = rollRecruits(seed, names, jobIds, 15);
      expect(new Set(roster.map((r) => r.name)).size).toBe(roster.length);
    }
  });

  it('職業は渡した一覧の中から選ばれる', () => {
    for (const recruit of rollRecruits(3, names, jobIds, 15)) {
      expect(jobIds).toContain(recruit.jobId);
    }
  });

  it('冒険レベルは1以上 maxLevel 以下', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const recruit of rollRecruits(seed, names, jobIds, 15)) {
        expect(recruit.adventureLevel).toBeGreaterThanOrEqual(1);
        expect(recruit.adventureLevel).toBeLessThanOrEqual(15);
      }
    }
  });

  it('素質は7項目すべてが埋まっている', () => {
    for (const recruit of rollRecruits(3, names, jobIds, 15)) {
      for (const key of ['maxHp', 'maxMp', 'atk', 'def', 'mat', 'mdf', 'spd'] as const) {
        expect(['A', 'B', 'C', 'D', 'E']).toContain(recruit.aptitude[key]);
      }
    }
  });

  it('値段は本人のレベルと素質から決まる', () => {
    for (const recruit of rollRecruits(3, names, jobIds, 15)) {
      expect(recruit.cost).toBe(recruitCost(recruit.adventureLevel, recruit.aptitude));
    }
  });

  it('IDは3人とも別々', () => {
    const roster = rollRecruits(3, names, jobIds, 15);
    expect(new Set(roster.map((r) => r.id)).size).toBe(roster.length);
  });

  it('顔ぶれは横並びに多様（30日分で職業が2種類以上出る）', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const recruit of rollRecruits(seed, names, jobIds, 15)) seen.add(recruit.jobId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('元の配列を変更しない', () => {
    const inputNames = [...names];
    rollRecruits(1, inputNames, jobIds, 15);
    expect(inputNames).toEqual(names);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/daily/recruit.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/daily/recruit.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/daily/recruit.ts`:

```ts
import { drawWithout, intAt } from './rng.js';
import type { Aptitude, Grade, JobId } from '../progression/types.js';

/** 酒場に日替わりで並ぶ人数。 */
export const RECRUITS_PER_DAY = 3;

const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D', 'E'];

const GRADE_VALUE: Readonly<Record<Grade, number>> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

/** 素質の項目数 × 最高評価。全項目Aのときの総合点。 */
const MAX_QUALITY = 7 * 4;

/** レベル1あたりの基本価格。 */
const COST_PER_LEVEL = 80;

export type Recruit = {
  readonly id: string;
  readonly name: string;
  readonly jobId: JobId;
  readonly aptitude: Aptitude;
  readonly adventureLevel: number;
  readonly cost: number;
};

/** 素質の総合点。全項目Aで28、全項目Eで0。 */
export function aptitudeQuality(aptitude: Aptitude): number {
  return (
    GRADE_VALUE[aptitude.maxHp] +
    GRADE_VALUE[aptitude.maxMp] +
    GRADE_VALUE[aptitude.atk] +
    GRADE_VALUE[aptitude.def] +
    GRADE_VALUE[aptitude.mat] +
    GRADE_VALUE[aptitude.mdf] +
    GRADE_VALUE[aptitude.spd]
  );
}

/**
 * 雇用の値段。冒険レベルに比例し、素質では最大2倍までしか上がらない。
 * この形にすると、素質の高い低レベル人材のほうが安くなり、
 * 育てる日数がそのままコストになる。デイリー制なので日数が一番高くつく。
 */
export function recruitCost(adventureLevel: number, aptitude: Aptitude): number {
  const quality = aptitudeQuality(aptitude);
  return Math.floor(COST_PER_LEVEL * adventureLevel * (1 + quality / MAX_QUALITY));
}

/** シードの引き位置。人ごとに離しておき、項目同士が相関しないようにする。 */
const SLOT_STRIDE = 100;

function gradeAt(seed: number, index: number): Grade {
  return GRADES[intAt(seed, index, GRADES.length)];
}

/**
 * その日の酒場に並ぶ顔ぶれを決める。
 * シードが共通なので全員が同じ3人を見る。
 * 名前は非復元抽出なので、同じ人物が2人並ぶことはない。
 */
export function rollRecruits(
  seed: number,
  names: readonly string[],
  jobIds: readonly JobId[],
  maxLevel: number,
): readonly Recruit[] {
  const picked = drawWithout(seed, names, RECRUITS_PER_DAY);

  return picked.map((name, slot) => {
    const base = (slot + 1) * SLOT_STRIDE;
    const aptitude: Aptitude = {
      maxHp: gradeAt(seed, base + 1),
      maxMp: gradeAt(seed, base + 2),
      atk: gradeAt(seed, base + 3),
      def: gradeAt(seed, base + 4),
      mat: gradeAt(seed, base + 5),
      mdf: gradeAt(seed, base + 6),
      spd: gradeAt(seed, base + 7),
    };
    const adventureLevel = intAt(seed, base + 8, maxLevel) + 1;

    return {
      id: `${seed}-${slot}`,
      name,
      jobId: jobIds[intAt(seed, base + 9, jobIds.length)],
      aptitude,
      adventureLevel,
      cost: recruitCost(adventureLevel, aptitude),
    };
  });
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件）

**落ちた場合は実装を直す。テストの期待値は変えない。**
「顔ぶれは横並びに多様」が落ちるなら、`SLOT_STRIDE` の間隔が近すぎて
項目同士が相関している可能性がある。間隔を広げて再確認すること。

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/daily/recruit.ts packages/core/tests/daily/recruit.test.ts
git commit -m "feat: 酒場の日替わりの顔ぶれと雇用コスト

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: マスタデータ・公開API・通しのテスト

**Files:**
- Create: `packages/core/src/data/events.ts`
- Create: `packages/core/src/data/names.ts`
- Modify: `packages/core/src/index.ts`（日次ロジックの公開APIを追加）
- Test: `packages/core/tests/daily/eventsData.test.ts`
- Test: `packages/core/tests/daily/dailyJourney.test.ts`

**Interfaces:**
- Consumes: これまでの全モジュール
- Produces: `EVENTS: Record<string, DailyEvent>`, `NAMES: readonly string[]`

- [ ] **Step 1: イベントプールを書く**

`packages/core/src/data/events.ts`:

```ts
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
```

- [ ] **Step 2: 人名プールを書く**

`packages/core/src/data/names.ts`:

```ts
/**
 * 酒場に並ぶ人物の名前。非復元抽出で3つ引くので、
 * 常に RECRUITS_PER_DAY より十分多く用意しておく。
 */
export const NAMES = [
  'アルド', 'ベラ', 'カイ', 'ディナ', 'エリク', 'フィナ',
  'ガレス', 'ハンナ', 'イーヴォ', 'ジェナ', 'クルト', 'リナ',
  'マルコ', 'ニケ', 'オルガ', 'パヴェル', 'クレア', 'ロイ',
  'セシル', 'テオ',
] as const satisfies readonly string[];
```

- [ ] **Step 3: 公開APIに追加する**

`packages/core/src/index.ts` の末尾に追記する:

```ts
export { hashString, randomAt, intAt, drawWithout } from './daily/rng.js';
export { daySeed, tavernSeed } from './daily/seed.js';
export {
  matchesCondition,
  eligibleEvents,
  pickEvents,
  OPTIONS_PER_DAY,
} from './daily/event.js';
export { tallyVotes } from './daily/vote.js';
export { isBossDay, chapterOf, closeDay, BOSS_INTERVAL } from './daily/day.js';
export {
  aptitudeQuality,
  recruitCost,
  rollRecruits,
  RECRUITS_PER_DAY,
} from './daily/recruit.js';

export type {
  EventKind,
  WorldFlags,
  EventCondition,
  EventOutcome,
  DailyEvent,
} from './daily/event.js';
export type { Vote, Tally } from './daily/vote.js';
export type { WorldDay } from './daily/day.js';
export type { Recruit } from './daily/recruit.js';

export { EVENTS } from './data/events.js';
export { NAMES } from './data/names.js';
```

- [ ] **Step 4: マスタの健全性テストを書く**

`packages/core/tests/daily/eventsData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../src/data/events.js';
import { NAMES } from '../../src/data/names.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { eligibleEvents, OPTIONS_PER_DAY } from '../../src/daily/event.js';
import { RECRUITS_PER_DAY } from '../../src/daily/recruit.js';

const events = Object.values(EVENTS);

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

  it('要求されるフラグは、どれかのイベントが与えうる', () => {
    const grantable = new Set(events.flatMap((event) => event.outcome?.addTags ?? []));
    for (const event of events) {
      for (const tag of event.condition.requiresTags ?? []) {
        expect(grantable).toContain(tag);
      }
    }
  });

  it('第1章でも第2章でも、3択を埋められるだけの候補がある', () => {
    for (const chapter of [1, 2]) {
      const count = eligibleEvents(events, { chapter, tags: [] }).length;
      expect(count).toBeGreaterThanOrEqual(OPTIONS_PER_DAY);
    }
  });

  it('フラグを集めきった状態でも3択を埋められる', () => {
    const allTags = events.flatMap((event) => event.outcome?.addTags ?? []);
    for (const chapter of [1, 2]) {
      const count = eligibleEvents(events, { chapter, tags: allTags }).length;
      expect(count).toBeGreaterThanOrEqual(OPTIONS_PER_DAY);
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
```

- [ ] **Step 5: 通しのテストを書く**

`packages/core/tests/daily/dailyJourney.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { daySeed, tavernSeed } from '../../src/daily/seed.js';
import { pickEvents } from '../../src/daily/event.js';
import { closeDay, chapterOf, isBossDay } from '../../src/daily/day.js';
import { rollRecruits } from '../../src/daily/recruit.js';
import { EVENTS } from '../../src/data/events.js';
import { NAMES } from '../../src/data/names.js';
import { JOBS } from '../../src/data/jobs.js';
import type { WorldDay } from '../../src/daily/day.js';
import type { Vote } from '../../src/daily/vote.js';

const pool = Object.values(EVENTS);
const basicJobs = Object.values(JOBS).filter((job) => job.tier === 'basic').map((job) => job.id);

/** その日の3択を作る。 */
function openDay(worldId: string, dayNo: number): WorldDay {
  const options = pickEvents(pool, { chapter: chapterOf(dayNo), tags: [] }, daySeed(worldId, dayNo));
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
    const closed = closeDay(day, votes, daySeed('world-1', 1));
    expect(closed.chosenId).toBe(day.optionIds[1]);
    expect(closed.counts?.[day.optionIds[1]]).toBe(2);
  });

  it('締め処理が二重に走っても世界は動かない', () => {
    const day = openDay('world-1', 1);
    const votes: Vote[] = [{ playerId: 'a', optionId: day.optionIds[0] }];
    const seed = daySeed('world-1', 1);
    const once = closeDay(day, votes, seed);
    expect(closeDay(closeDay(once, votes, seed), votes, seed)).toEqual(once);
  });

  it('1人だけでも世界は進む', () => {
    const day = openDay('world-1', 3);
    const closed = closeDay(day, [{ playerId: 'solo', optionId: day.optionIds[2] }], daySeed('world-1', 3));
    expect(closed.chosenId).toBe(day.optionIds[2]);
    expect(closed.tiebroken).toBe(false);
  });

  it('30日分回しても、毎日3択が出て必ず締まる', () => {
    for (let dayNo = 1; dayNo <= 30; dayNo++) {
      const day = openDay('world-1', dayNo);
      expect(day.optionIds.length).toBeGreaterThan(0);
      const closed = closeDay(day, [], daySeed('world-1', dayNo));
      expect(closed.chosenId).not.toBeNull();
    }
  });

  it('7日ごとにボスの日が来る', () => {
    const bossDays = Array.from({ length: 30 }, (_, i) => i + 1).filter(isBossDay);
    expect(bossDays).toEqual([7, 14, 21, 28]);
  });

  it('酒場の顔ぶれはイベントの3択と相関しない', () => {
    const eventFirsts = new Set<string>();
    const tavernFirsts = new Set<string>();
    for (let dayNo = 1; dayNo <= 20; dayNo++) {
      eventFirsts.add(openDay('world-1', dayNo).optionIds[0]);
      tavernFirsts.add(rollRecruits(tavernSeed('world-1', dayNo), NAMES, basicJobs, 15)[0].name);
    }
    expect(eventFirsts.size).toBeGreaterThan(1);
    expect(tavernFirsts.size).toBeGreaterThan(1);
  });

  it('酒場には毎日3人並び、値段がついている', () => {
    for (let dayNo = 1; dayNo <= 10; dayNo++) {
      const roster = rollRecruits(tavernSeed('world-1', dayNo), NAMES, basicJobs, 15);
      expect(roster).toHaveLength(3);
      for (const recruit of roster) {
        expect(recruit.cost).toBeGreaterThan(0);
        expect(basicJobs).toContain(recruit.jobId);
      }
    }
  });
});
```

- [ ] **Step 6: テストと型検査を走らせる**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS

Run: `corepack pnpm --filter @mq/core typecheck`
Expected: エラーなし

**健全性テストが落ちる場合はデータを直す。** 「3択を埋められるだけの候補がある」が
落ちるなら、その章で条件を満たすイベントが足りていない。`events.ts` に足すこと。
テストの期待値は変えない。

- [ ] **Step 7: 禁止された乱数源を使っていないことを確認する**

Run: `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src`
Expected: 出力なし

- [ ] **Step 8: コミット**

```bash
git add packages/core/src/data packages/core/src/index.ts packages/core/tests/daily
git commit -m "feat: イベント・人名のマスタと日次ループの通し

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の定義

- [ ] `corepack pnpm --filter @mq/core test` が全件 PASS
- [ ] `corepack pnpm --filter @mq/core typecheck` がエラーなし
- [ ] `packages/core/package.json` の `dependencies` が空
- [ ] `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src` が空
- [ ] 同じ世界・同じ日なら、誰が計算しても同じ3択・同じ顔ぶれになる
- [ ] 締め処理を二重に呼んでも確定した選択肢が動かない
- [ ] 30日分回しても毎日3択が出て、必ず締まる
- [ ] 1人だけでも多数決が成立する

## この計画に含まれないもの

- **Cloudflare Worker / D1 / Cron Trigger**（段階3b）。この計画は
  「締めるとどうなるか」を関数にするだけで、「JST 05:00 に誰が呼ぶか」は扱わない
- **複数日を溜めて順に処理する取り戻し**（段階3b）。1日分の締めが冪等であることは
  ここで保証する
- 戦闘報酬の量、ボス討伐の貢献記録、初撃破の称号（段階4。永続化が要る）
- ペットの効果の適用。イベントが `petId` を返すところまでで、
  それを装備に載せるのは段階4
- 画面・投票のUI（段階4）
