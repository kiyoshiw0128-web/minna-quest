# 育成 実装計画（段階2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャラクターが冒険レベルとジョブレベルの二階建てで育ち、職業を自由に変え、ジョブレベルで技を覚え、上級職に就けるようにする。

**Architecture:** `packages/core/src/progression/` に純関数として置く。段階1の戦闘エンジンと同じ規律 — 依存ゼロ、乱数なし、状態は不変。育成上のキャラは `Character` という戦闘用 `PartyMember` とは別の型で持ち、`toPartyMember()` の一関数だけが両者を繋ぐ。この境界のおかげで、育成は戦闘を知らずにテストできる。

**Tech Stack:** TypeScript 5.6 / Vitest 2 / pnpm workspace。`packages/core` は実行時依存ゼロ。

**Spec:** `docs/superpowers/specs/2026-09-03-minna-quest-design.md`（4章が要件）

## この計画の範囲

仕様書4.1〜4.3と、4.4のうち**素質（成長率）の仕組み**まで。

**含まれないもの:**
- **雇用市場の生成**（酒場に日替わりで3人並ぶ）。その日のシードを必要とし、
  そのシード付き乱数は段階3のイベント抽選と共有すべきなので、別計画にする
- ペットの入手（イベント報酬。段階3）
- 戦闘報酬としての経験値の量（段階3の報酬表）。ここでは `gainExp` が
  受け取るだけで、いくら渡すかは決めない

## Global Constraints

- `packages/core` に **実行時依存を入れない**。devDependencies は vitest と typescript のみ
- **乱数を使わない。** `Math.random`、`Date.now`、`crypto` の呼び出しは禁止
- **状態を破壊的に変更しない。** 既存オブジェクトを書き換えず、新しいオブジェクトを返す
- ステータス・経験値・レベルはすべて整数。小数は `Math.floor` で落とす
- マスタデータは `packages/core/src/data/` に TypeScript の定数として置き、
  `as const satisfies Record<string, T>` で実行時に書き換えられないようにする。
  配列フィールドは型側で `readonly` にする
- TypeScript は `strict: true`
- import は拡張子 `.js` 付きで書く。型のみの import は `import type`
- コミットメッセージは `<type>: <description>` 形式（feat / fix / test / chore / docs）。
  本文の末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- テストは `corepack pnpm --filter @mq/core test`、型検査は `corepack pnpm --filter @mq/core typecheck`

## 段階1が公開しているもの（前提）

```
battle/types.ts    StatBlock { maxHp, maxMp, atk, def, mat, mdf, spd } / Element / DamageSpec
battle/effects.ts  StatKey = 'atk'|'def'|'mat'|'mdf'|'spd' / Effect / ActiveEffect
battle/skill.ts    Skill { id, name, mpCost, cooldown, element, target, damage?, heal?, effects? }
battle/state.ts    PartyMember { id, name, stats, skills, passives? }
data/skills.ts     SKILLS（slash / heavyBlow / armorBreak / iceLance / blizzard /
                          holyLight / guardChant / poisonDagger の8つ）
```

**注意:** `StatKey` は `maxHp` と `maxMp` を含まない。したがってパッシブで最大HPは上げられない。

---

## ファイル構成

```
packages/core/src/progression/
  types.ts      Grade / Aptitude / JobId / JobProgress / Character / Passive / ProgressEvent
  aptitude.ts   素質の等級 -> 倍率
  curve.ts      経験値曲線とレベル上限
  job.ts        Job / JobRequirement / JobStatBonus / LearnEntry の型
  stats.ts      computeStats — キャラの実効ステータス
  exp.ts        gainExp — 経験値付与・レベルアップ・習得
  unlock.ts     unlockedJobs / canChangeJob / changeJob
  equip.ts      equipActive / equipPassive と枠数
  bridge.ts     toPartyMember — 戦闘への橋渡し
packages/core/src/data/
  skills.ts     （修正）アクティブ技を6つ追加
  passives.ts   PASSIVES
  jobs.ts       JOBS（基本6 + 上級3）
packages/core/tests/progression/*.test.ts
```

`stats.ts` はキャラと職業しか知らない。`exp.ts` は職業表を引数で受け取り、
データを直接 import しない。この向きにしておくと、テストが小さな作り物の
職業表で回せる。

---

### Task 1: 型と素質の倍率

**Files:**
- Create: `packages/core/src/progression/types.ts`
- Create: `packages/core/src/progression/aptitude.ts`
- Test: `packages/core/tests/progression/aptitude.test.ts`

**Interfaces:**
- Consumes: `StatBlock`（`battle/types.js`）、`Effect`（`battle/effects.js`）
- Produces: `Grade`, `Aptitude`, `JobId`, `JobProgress`, `Character`, `Passive`, `ProgressEvent`, `aptitudeMultiplier(grade: Grade): number`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/aptitude.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aptitudeMultiplier } from '../../src/progression/aptitude.js';

describe('aptitudeMultiplier', () => {
  it('C を基準の 1.0 とする', () => {
    expect(aptitudeMultiplier('C')).toBe(1.0);
  });

  it('等級が上がるほど伸びが大きい', () => {
    expect(aptitudeMultiplier('A')).toBeGreaterThan(aptitudeMultiplier('B'));
    expect(aptitudeMultiplier('B')).toBeGreaterThan(aptitudeMultiplier('C'));
  });

  it('等級が下がるほど伸びが小さい', () => {
    expect(aptitudeMultiplier('C')).toBeGreaterThan(aptitudeMultiplier('D'));
    expect(aptitudeMultiplier('D')).toBeGreaterThan(aptitudeMultiplier('E'));
  });

  it('最低でも伸びが止まりはしない', () => {
    expect(aptitudeMultiplier('E')).toBeGreaterThan(0);
  });

  it('具体的な倍率を固定する', () => {
    expect(aptitudeMultiplier('A')).toBe(1.3);
    expect(aptitudeMultiplier('E')).toBe(0.7);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/aptitude.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/aptitude.js"`

- [ ] **Step 3: 型を書く**

`packages/core/src/progression/types.ts`:

```ts
import type { StatBlock } from '../battle/types.js';
import type { Effect } from '../battle/effects.js';

/** 素質の等級。A が最も伸びる。 */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * 成長率。転職しても変わらない、その人物の地力。
 * 冒険レベルの伸びにだけ掛かり、素の値には掛からない。
 */
export type Aptitude = Readonly<Record<keyof StatBlock, Grade>>;

export type JobId = string;

/** ある職業での進み具合。職業ごとに独立して持つ。 */
export type JobProgress = { level: number; exp: number };

/**
 * 育成上のキャラクター。戦闘用の PartyMember とは別物で、
 * bridge.ts の toPartyMember だけが両者を繋ぐ。
 * 主人公も雇用メンバーもこの型ひとつで表す。
 */
export type Character = {
  id: string;
  name: string;
  /** 冒険レベル。転職しても絶対に下がらない */
  adventureLevel: number;
  adventureExp: number;
  aptitude: Aptitude;
  currentJob: JobId;
  /** 就いたことのある職業だけが載る */
  jobs: Readonly<Record<JobId, JobProgress>>;
  /** 習得済み。転職しても永久に消えない */
  learnedSkills: readonly string[];
  learnedPassives: readonly string[];
  /** 戦闘に持ち込むもの。習得済みの中から選ぶ */
  equippedActive: readonly string[];
  equippedPassive: readonly string[];
};

/** 装備できるパッシブ。戦闘開始時から永続でかかる。 */
export type Passive = { id: string; name: string; effect: Effect };

export type ProgressEvent =
  | { t: 'adventureLevelUp'; level: number }
  | { t: 'jobLevelUp'; jobId: JobId; level: number }
  | { t: 'skillLearned'; skillId: string }
  | { t: 'passiveLearned'; passiveId: string }
  | { t: 'jobUnlocked'; jobId: JobId };
```

- [ ] **Step 4: 素質の倍率を書く**

`packages/core/src/progression/aptitude.ts`:

```ts
import type { Grade } from './types.js';

/**
 * 素質の倍率。レベルごとの伸びにだけ掛かるので、
 * 差はレベルが上がるほど開いていく。
 */
const MULTIPLIER: Readonly<Record<Grade, number>> = {
  A: 1.3,
  B: 1.15,
  C: 1.0,
  D: 0.85,
  E: 0.7,
};

export function aptitudeMultiplier(grade: Grade): number {
  return MULTIPLIER[grade];
}
```

- [ ] **Step 5: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/progression packages/core/tests/progression
git commit -m "feat: 育成の型と素質の倍率

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 経験値曲線とレベル上限

**Files:**
- Create: `packages/core/src/progression/curve.ts`
- Test: `packages/core/tests/progression/curve.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `MAX_ADVENTURE_LEVEL` (50), `MAX_JOB_LEVEL` (30), `adventureExpToNext(level: number): number`, `jobExpToNext(level: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/curve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  adventureExpToNext,
  jobExpToNext,
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
} from '../../src/progression/curve.js';

describe('adventureExpToNext', () => {
  it('レベル1から2へは60', () => {
    expect(adventureExpToNext(1)).toBe(60);
  });

  it('レベルが上がるほど必要量が増える', () => {
    expect(adventureExpToNext(10)).toBeGreaterThan(adventureExpToNext(9));
  });

  it('二乗で増える', () => {
    expect(adventureExpToNext(10)).toBe(6000);
  });

  it('必ず整数を返す', () => {
    for (let level = 1; level <= MAX_ADVENTURE_LEVEL; level++) {
      expect(Number.isInteger(adventureExpToNext(level))).toBe(true);
    }
  });
});

describe('jobExpToNext', () => {
  it('冒険レベルより早く上がる', () => {
    expect(jobExpToNext(10)).toBeLessThan(adventureExpToNext(10));
  });

  it('レベル1から2へは30', () => {
    expect(jobExpToNext(1)).toBe(30);
  });

  it('必ず整数を返す', () => {
    for (let level = 1; level <= MAX_JOB_LEVEL; level++) {
      expect(Number.isInteger(jobExpToNext(level))).toBe(true);
    }
  });
});

describe('上限', () => {
  it('上級職の解禁条件（ジョブLv20）に届く上限である', () => {
    expect(MAX_JOB_LEVEL).toBeGreaterThanOrEqual(20);
  });

  it('冒険レベルの上限はジョブレベルより高い', () => {
    expect(MAX_ADVENTURE_LEVEL).toBeGreaterThan(MAX_JOB_LEVEL);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/curve.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/curve.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/curve.ts`:

```ts
/** 冒険レベルの上限。 */
export const MAX_ADVENTURE_LEVEL = 50;

/** ジョブレベルの上限。上級職の解禁条件（Lv20）に余裕を持って届く。 */
export const MAX_JOB_LEVEL = 30;

/**
 * 次の冒険レベルまでに必要な経験値。
 * 二乗で増やすのは、デイリー制で1日1戦しか進まないため、
 * 後半のレベルが長期目標として機能するようにするため。
 */
export function adventureExpToNext(level: number): number {
  return 60 * level * level;
}

/**
 * 次のジョブレベルまでに必要な経験値。
 * 冒険レベルの半分の傾きにして、職業を試す敷居を低くしている。
 */
export function jobExpToNext(level: number): number {
  return 30 * level * level;
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/curve.ts packages/core/tests/progression/curve.test.ts
git commit -m "feat: 経験値曲線とレベル上限

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 職業の型

**Files:**
- Create: `packages/core/src/progression/job.ts`
- Test: `packages/core/tests/progression/job.test.ts`

**Interfaces:**
- Consumes: `StatBlock`（`battle/types.js`）、`JobId`（`progression/types.js`）
- Produces: `JobRequirement`, `JobStatBonus`, `LearnEntry`, `Job`, `learnsAt(job: Job, level: number): readonly LearnEntry[]`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/job.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { learnsAt } from '../../src/progression/job.js';
import type { Job } from '../../src/progression/job.js';

const dummy: Job = {
  id: 'dummy',
  name: 'ためし',
  tier: 'basic',
  statBonus: { atk: 3 },
  learnset: [
    { level: 1, kind: 'skill', id: 'slash' },
    { level: 5, kind: 'skill', id: 'heavyBlow' },
    { level: 5, kind: 'passive', id: 'ironSkin' },
  ],
  requires: [],
};

describe('learnsAt', () => {
  it('そのレベルで覚えるものだけを返す', () => {
    expect(learnsAt(dummy, 1)).toEqual([{ level: 1, kind: 'skill', id: 'slash' }]);
  });

  it('同じレベルに複数あればすべて返す', () => {
    expect(learnsAt(dummy, 5)).toHaveLength(2);
  });

  it('何も覚えないレベルでは空を返す', () => {
    expect(learnsAt(dummy, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/job.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/job.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/job.ts`:

```ts
import type { StatBlock } from '../battle/types.js';
import type { JobId } from './types.js';

/** 上級職の解禁条件。すべて満たすと就ける。 */
export type JobRequirement = { jobId: JobId; level: number };

/** ジョブレベル1つあたりのステータス補正。 */
export type JobStatBonus = Partial<Readonly<Record<keyof StatBlock, number>>>;

/** そのジョブレベルに到達したときに覚えるもの。 */
export type LearnEntry =
  | { level: number; kind: 'skill'; id: string }
  | { level: number; kind: 'passive'; id: string };

export type Job = {
  id: JobId;
  name: string;
  tier: 'basic' | 'advanced';
  statBonus: JobStatBonus;
  learnset: readonly LearnEntry[];
  /** 空なら最初から就ける。上級職だけが条件を持つ */
  requires: readonly JobRequirement[];
};

/** そのジョブレベルちょうどで覚えるものを返す。 */
export function learnsAt(job: Job, level: number): readonly LearnEntry[] {
  return job.learnset.filter((entry) => entry.level === level);
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/job.ts packages/core/tests/progression/job.test.ts
git commit -m "feat: 職業の型と習得表の引き当て

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: ステータス計算

**Files:**
- Create: `packages/core/src/progression/stats.ts`
- Test: `packages/core/tests/progression/stats.test.ts`

**Interfaces:**
- Consumes: `StatBlock`、`aptitudeMultiplier`（Task 1）、`Character`（Task 1）、`Job`（Task 3）
- Produces: `BASE_STATS: StatBlock`, `GROWTH_PER_LEVEL: StatBlock`, `computeStats(character: Character, job: Job): StatBlock`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStats, BASE_STATS } from '../../src/progression/stats.js';
import type { Character, Aptitude } from '../../src/progression/types.js';
import type { Job } from '../../src/progression/job.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const warrior: Job = {
  id: 'warrior', name: '戦士', tier: 'basic',
  statBonus: { atk: 3, def: 2, maxHp: 8 },
  learnset: [], requires: [],
};

const noBonus: Job = {
  id: 'blank', name: '無', tier: 'basic', statBonus: {}, learnset: [], requires: [],
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 1, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: [], learnedPassives: [],
    equippedActive: [], equippedPassive: [],
    ...over,
  };
}

describe('computeStats', () => {
  it('冒険レベル1・ジョブレベル1では素の値に職業補正が1回だけ乗る', () => {
    const stats = computeStats(character(), warrior);
    expect(stats.atk).toBe(BASE_STATS.atk + 3);
    expect(stats.def).toBe(BASE_STATS.def + 2);
  });

  it('職業補正の無い職業では素の値そのもの', () => {
    const stats = computeStats(character({ currentJob: 'blank', jobs: { blank: { level: 1, exp: 0 } } }), noBonus);
    expect(stats.atk).toBe(BASE_STATS.atk);
    expect(stats.maxHp).toBe(BASE_STATS.maxHp);
  });

  it('冒険レベルが上がると伸びる', () => {
    const low = computeStats(character(), noBonus);
    const high = computeStats(character({ adventureLevel: 10, currentJob: 'blank', jobs: { blank: { level: 1, exp: 0 } } }), noBonus);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
  });

  it('素質が高いほど冒険レベルの伸びが大きい', () => {
    const talented: Aptitude = { ...flat, atk: 'A' };
    const weak: Aptitude = { ...flat, atk: 'E' };
    const base = { adventureLevel: 20, currentJob: 'blank' as const, jobs: { blank: { level: 1, exp: 0 } } };
    const a = computeStats(character({ ...base, aptitude: talented }), noBonus);
    const e = computeStats(character({ ...base, aptitude: weak }), noBonus);
    expect(a.atk).toBeGreaterThan(e.atk);
  });

  it('素質は素の値には掛からない（レベル1では差が出ない）', () => {
    const talented: Aptitude = { ...flat, atk: 'A' };
    const base = { currentJob: 'blank' as const, jobs: { blank: { level: 1, exp: 0 } } };
    const a = computeStats(character({ ...base, aptitude: talented }), noBonus);
    const c = computeStats(character({ ...base }), noBonus);
    expect(a.atk).toBe(c.atk);
  });

  it('ジョブレベルに比例して職業補正が乗る', () => {
    const lv1 = computeStats(character(), warrior);
    const lv10 = computeStats(character({ jobs: { warrior: { level: 10, exp: 0 } } }), warrior);
    expect(lv10.atk - lv1.atk).toBe(27);
  });

  it('すべて整数を返す', () => {
    const stats = computeStats(character({ adventureLevel: 33 }), warrior);
    for (const value of Object.values(stats)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('どのステータスも1を下回らない', () => {
    const stats = computeStats(character(), noBonus);
    for (const value of Object.values(stats)) {
      expect(value).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/stats.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/stats.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/stats.ts`:

```ts
import type { StatBlock } from '../battle/types.js';
import { aptitudeMultiplier } from './aptitude.js';
import type { Character } from './types.js';
import type { Job } from './job.js';

/** 冒険レベル1・素質不問のときの素の値。 */
export const BASE_STATS: StatBlock = {
  maxHp: 120, maxMp: 20, atk: 12, def: 10, mat: 10, mdf: 10, spd: 10,
};

/** 冒険レベルが1上がるごとの伸び（素質Cのとき）。 */
export const GROWTH_PER_LEVEL: StatBlock = {
  maxHp: 28, maxMp: 6, atk: 4, def: 3, mat: 3, mdf: 3, spd: 1.2,
};

const STAT_KEYS = ['maxHp', 'maxMp', 'atk', 'def', 'mat', 'mdf', 'spd'] as const;

/**
 * キャラの実効ステータスを求める。
 *
 *   素の値 + 冒険レベルの伸び × 素質 + 現在の職業の補正 × ジョブレベル
 *
 * 素質を伸びにだけ掛けるのは、差がレベルとともに開いていくようにするため。
 * 冒険レベルは転職しても下がらないので、この式の第2項は転職で失われない。
 */
export function computeStats(character: Character, job: Job): StatBlock {
  const levels = character.adventureLevel - 1;
  const jobLevel = character.jobs[character.currentJob]?.level ?? 1;

  const stats = {} as Record<keyof StatBlock, number>;
  for (const key of STAT_KEYS) {
    const grown = GROWTH_PER_LEVEL[key] * levels * aptitudeMultiplier(character.aptitude[key]);
    const bonus = (job.statBonus[key] ?? 0) * jobLevel;
    stats[key] = Math.max(1, Math.floor(BASE_STATS[key] + grown + bonus));
  }
  return stats;
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/stats.ts packages/core/tests/progression/stats.test.ts
git commit -m "feat: 冒険レベル・素質・職業補正からのステータス計算

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 経験値付与・レベルアップ・習得

**Files:**
- Create: `packages/core/src/progression/exp.ts`
- Test: `packages/core/tests/progression/exp.test.ts`

**Interfaces:**
- Consumes: `Character`/`ProgressEvent`（Task 1）、曲線と上限（Task 2）、`Job`/`learnsAt`（Task 3）
- Produces: `ExpGain = { adventure: number; job: number }`, `JobTable = Readonly<Record<JobId, Job>>`, `applyLearns(character: Character, entries: readonly LearnEntry[]): { character: Character; events: ProgressEvent[] }`, `gainExp(character: Character, gain: ExpGain, jobs: JobTable): { character: Character; events: ProgressEvent[] }`

**設計の要点:** 1回の付与で複数レベル上がりうる。ジョブレベルが上がるたびに
`learnsAt` を引いて習得する。習得済みのものは二重に足さない。
上限に達したら余った経験値は捨てる。

習得の処理は `applyLearns` として切り出す。**Task 6 の転職からも同じ処理を使う**ため。
新しい職業に就いた瞬間、その職業のレベル1の習得が発生しないと、
転職直後のキャラが技を1つも持たないことになる。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/exp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gainExp, applyLearns } from '../../src/progression/exp.js';
import type { JobTable } from '../../src/progression/exp.js';
import { MAX_ADVENTURE_LEVEL, MAX_JOB_LEVEL } from '../../src/progression/curve.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const jobs: JobTable = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic', statBonus: { atk: 3 },
    learnset: [
      { level: 2, kind: 'skill', id: 'heavyBlow' },
      { level: 3, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [],
  },
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 1, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: [], learnedPassives: [],
    equippedActive: [], equippedPassive: [],
    ...over,
  };
}

describe('gainExp - 冒険レベル', () => {
  it('足りなければ経験値だけ溜まる', () => {
    const { character: after, events } = gainExp(character(), { adventure: 10, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(1);
    expect(after.adventureExp).toBe(10);
    expect(events).toHaveLength(0);
  });

  it('足りればレベルが上がり、余りは持ち越す', () => {
    const { character: after, events } = gainExp(character(), { adventure: 70, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(2);
    expect(after.adventureExp).toBe(10);
    expect(events).toContainEqual({ t: 'adventureLevelUp', level: 2 });
  });

  it('一度に複数レベル上がる', () => {
    const { character: after } = gainExp(character(), { adventure: 10000, job: 0 }, jobs);
    expect(after.adventureLevel).toBeGreaterThan(3);
  });

  it('上限で止まり、余った経験値は捨てる', () => {
    const maxed = character({ adventureLevel: MAX_ADVENTURE_LEVEL });
    const { character: after } = gainExp(maxed, { adventure: 999999, job: 0 }, jobs);
    expect(after.adventureLevel).toBe(MAX_ADVENTURE_LEVEL);
    expect(after.adventureExp).toBe(0);
  });
});

describe('gainExp - ジョブレベルと習得', () => {
  it('ジョブレベルが上がると技を覚える', () => {
    const { character: after, events } = gainExp(character(), { adventure: 0, job: 30 }, jobs);
    expect(after.jobs['warrior'].level).toBe(2);
    expect(after.learnedSkills).toContain('heavyBlow');
    expect(events).toContainEqual({ t: 'jobLevelUp', jobId: 'warrior', level: 2 });
    expect(events).toContainEqual({ t: 'skillLearned', skillId: 'heavyBlow' });
  });

  it('パッシブも覚える', () => {
    const { character: after, events } = gainExp(character(), { adventure: 0, job: 500 }, jobs);
    expect(after.learnedPassives).toContain('ironSkin');
    expect(events).toContainEqual({ t: 'passiveLearned', passiveId: 'ironSkin' });
  });

  it('複数レベル上がったら途中のものも全部覚える', () => {
    const { character: after } = gainExp(character(), { adventure: 0, job: 500 }, jobs);
    expect(after.learnedSkills).toContain('heavyBlow');
    expect(after.learnedPassives).toContain('ironSkin');
  });

  it('すでに覚えているものを二重に足さない', () => {
    const known = character({ learnedSkills: ['heavyBlow'] });
    const { character: after, events } = gainExp(known, { adventure: 0, job: 30 }, jobs);
    expect(after.learnedSkills.filter((id) => id === 'heavyBlow')).toHaveLength(1);
    expect(events).not.toContainEqual({ t: 'skillLearned', skillId: 'heavyBlow' });
  });

  it('経験値は現在の職業にだけ入る', () => {
    const two = character({
      jobs: { warrior: { level: 1, exp: 0 }, mage: { level: 5, exp: 100 } },
    });
    const { character: after } = gainExp(two, { adventure: 0, job: 30 }, jobs);
    expect(after.jobs['mage']).toEqual({ level: 5, exp: 100 });
  });

  it('ジョブレベルの上限で止まる', () => {
    const maxed = character({ jobs: { warrior: { level: MAX_JOB_LEVEL, exp: 0 } } });
    const { character: after } = gainExp(maxed, { adventure: 0, job: 999999 }, jobs);
    expect(after.jobs['warrior'].level).toBe(MAX_JOB_LEVEL);
    expect(after.jobs['warrior'].exp).toBe(0);
  });
});

describe('gainExp - 不変性', () => {
  it('元のキャラを書き換えない', () => {
    const before = character();
    gainExp(before, { adventure: 10000, job: 10000 }, jobs);
    expect(before.adventureLevel).toBe(1);
    expect(before.learnedSkills).toHaveLength(0);
    expect(before.jobs['warrior'].level).toBe(1);
  });
});

describe('applyLearns', () => {
  it('技とパッシブを両方反映する', () => {
    const { character: after, events } = applyLearns(character(), [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 1, kind: 'passive', id: 'ironSkin' },
    ]);
    expect(after.learnedSkills).toEqual(['slash']);
    expect(after.learnedPassives).toEqual(['ironSkin']);
    expect(events).toHaveLength(2);
  });

  it('すでに覚えているものは足さず、イベントも出さない', () => {
    const known = character({ learnedSkills: ['slash'] });
    const { character: after, events } = applyLearns(known, [
      { level: 1, kind: 'skill', id: 'slash' },
    ]);
    expect(after.learnedSkills).toEqual(['slash']);
    expect(events).toHaveLength(0);
  });

  it('空の表なら何も起きない', () => {
    const { events } = applyLearns(character(), []);
    expect(events).toHaveLength(0);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    applyLearns(before, [{ level: 1, kind: 'skill', id: 'slash' }]);
    expect(before.learnedSkills).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/exp.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/exp.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/exp.ts`:

```ts
import {
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
  adventureExpToNext,
  jobExpToNext,
} from './curve.js';
import { learnsAt } from './job.js';
import type { Job, LearnEntry } from './job.js';
import type { Character, JobId, JobProgress, ProgressEvent } from './types.js';

export type ExpGain = { adventure: number; job: number };

export type JobTable = Readonly<Record<JobId, Job>>;

/**
 * 経験値を与えてレベルアップと習得を解決する。
 * 一度に複数レベル上がることがあり、その途中で覚えるものも全部拾う。
 * 上限に達したら余った経験値は捨てる（溜め込んでも使い道がないため）。
 */
export function gainExp(
  character: Character,
  gain: ExpGain,
  jobs: JobTable,
): { character: Character; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];

  const adventure = advanceAdventure(character, gain.adventure, events);
  const job = advanceJob({ ...character, ...adventure }, gain.job, jobs, events);

  return { character: { ...character, ...adventure, ...job }, events };
}

/**
 * 習得表の項目をキャラに反映する。すでに覚えているものは足さない。
 * レベルアップからも転職からも呼ばれる。転職で新しい職業に就いたときに
 * レベル1の習得が起きないと、そのキャラは技を1つも持たないまま戦うことになる。
 */
export function applyLearns(
  character: Character,
  entries: readonly LearnEntry[],
): { character: Character; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];
  const skills = [...character.learnedSkills];
  const passives = [...character.learnedPassives];

  for (const entry of entries) {
    if (entry.kind === 'skill' && !skills.includes(entry.id)) {
      skills.push(entry.id);
      events.push({ t: 'skillLearned', skillId: entry.id });
    }
    if (entry.kind === 'passive' && !passives.includes(entry.id)) {
      passives.push(entry.id);
      events.push({ t: 'passiveLearned', passiveId: entry.id });
    }
  }

  return {
    character: { ...character, learnedSkills: skills, learnedPassives: passives },
    events,
  };
}

function advanceAdventure(
  character: Character,
  amount: number,
  events: ProgressEvent[],
): Pick<Character, 'adventureLevel' | 'adventureExp'> {
  let level = character.adventureLevel;
  let exp = character.adventureExp + amount;

  while (level < MAX_ADVENTURE_LEVEL && exp >= adventureExpToNext(level)) {
    exp -= adventureExpToNext(level);
    level += 1;
    events.push({ t: 'adventureLevelUp', level });
  }

  return { adventureLevel: level, adventureExp: level >= MAX_ADVENTURE_LEVEL ? 0 : exp };
}

function advanceJob(
  character: Character,
  amount: number,
  jobs: JobTable,
  events: ProgressEvent[],
): Pick<Character, 'jobs' | 'learnedSkills' | 'learnedPassives'> {
  const jobId = character.currentJob;
  const current: JobProgress = character.jobs[jobId] ?? { level: 1, exp: 0 };
  const definition = jobs[jobId];

  let level = current.level;
  let exp = current.exp + amount;
  let learner = character;

  while (level < MAX_JOB_LEVEL && exp >= jobExpToNext(level)) {
    exp -= jobExpToNext(level);
    level += 1;
    events.push({ t: 'jobLevelUp', jobId, level });

    if (!definition) continue;
    const learned = applyLearns(learner, learnsAt(definition, level));
    learner = learned.character;
    events.push(...learned.events);
  }

  return {
    jobs: {
      ...character.jobs,
      [jobId]: { level, exp: level >= MAX_JOB_LEVEL ? 0 : exp },
    },
    learnedSkills: learner.learnedSkills,
    learnedPassives: learner.learnedPassives,
  };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/exp.ts packages/core/tests/progression/exp.test.ts
git commit -m "feat: 経験値付与とレベルアップ・スキル習得

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: キャラの生成・上級職の解禁・転職

**Files:**
- Create: `packages/core/src/progression/unlock.ts`
- Test: `packages/core/tests/progression/unlock.test.ts`

**Interfaces:**
- Consumes: `Character`/`JobId`（Task 1）、`Job`/`learnsAt`（Task 3）、`JobTable`/`applyLearns`（Task 5）
- Produces: `JobChangeError = 'unknownJob' | 'locked' | 'alreadyCurrent'`, `isUnlocked(character: Character, job: Job): boolean`, `unlockedJobs(character: Character, jobs: JobTable): readonly JobId[]`, `canChangeJob(character: Character, jobId: JobId, jobs: JobTable): 'ok' | JobChangeError`, `changeJob(character: Character, jobId: JobId, jobs: JobTable): { ok: true; character: Character } | { ok: false; reason: JobChangeError }`, `createCharacter(params: { id: string; name: string; aptitude: Aptitude; job: JobId }, jobs: JobTable): Character`

**設計の要点:** 転職しても冒険レベル・習得済み・他の職業の進み具合は一切変わらない。
初めて就く職業は `jobs` に `{ level: 1, exp: 0 }` で追加され、**その職業のレベル1の
習得がその場で起きる**。これが無いと、転職直後のキャラは技を1つも持たないまま戦うことになる。
装備中の技はそのまま残す（習得済みは永久に消えないため、装備し直す必要がない）。

`createCharacter` も同じ理由で必要になる。キャラはレベル1から始まるので、
「レベルアップしたときに覚える」だけでは初期職のレベル1の技が永久に手に入らない。
生成時に習得と装備をまとめて済ませる。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/unlock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isUnlocked,
  unlockedJobs,
  canChangeJob,
  changeJob,
  createCharacter,
} from '../../src/progression/unlock.js';
import type { JobTable } from '../../src/progression/exp.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const jobs: JobTable = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic', statBonus: {},
    learnset: [{ level: 1, kind: 'skill', id: 'slash' }],
    requires: [],
  },
  priest: {
    id: 'priest', name: '僧侶', tier: 'basic', statBonus: {},
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 1, kind: 'passive', id: 'calm' },
    ],
    requires: [],
  },
  paladin: {
    id: 'paladin', name: 'パラディン', tier: 'advanced', statBonus: {}, learnset: [],
    requires: [{ jobId: 'warrior', level: 20 }, { jobId: 'priest', level: 15 }],
  },
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 10, adventureExp: 40,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: ['slash'], learnedPassives: [],
    equippedActive: ['slash'], equippedPassive: [],
    ...over,
  };
}

const qualified = {
  jobs: {
    warrior: { level: 20, exp: 0 },
    priest: { level: 15, exp: 0 },
  },
};

describe('isUnlocked', () => {
  it('条件の無い職業は常に就ける', () => {
    expect(isUnlocked(character(), jobs['warrior'])).toBe(true);
  });

  it('条件を満たしていなければ就けない', () => {
    expect(isUnlocked(character(), jobs['paladin'])).toBe(false);
  });

  it('片方だけ満たしても就けない', () => {
    const half = character({ jobs: { warrior: { level: 20, exp: 0 } } });
    expect(isUnlocked(half, jobs['paladin'])).toBe(false);
  });

  it('すべて満たせば就ける', () => {
    expect(isUnlocked(character(qualified), jobs['paladin'])).toBe(true);
  });

  it('条件を超えていても就ける', () => {
    const over = character({ jobs: { warrior: { level: 30, exp: 0 }, priest: { level: 30, exp: 0 } } });
    expect(isUnlocked(over, jobs['paladin'])).toBe(true);
  });
});

describe('unlockedJobs', () => {
  it('就ける職業のIDを返す', () => {
    expect(unlockedJobs(character(), jobs)).toEqual(['warrior', 'priest']);
  });

  it('条件を満たすと上級職が増える', () => {
    expect(unlockedJobs(character(qualified), jobs)).toContain('paladin');
  });
});

describe('canChangeJob', () => {
  it('知らない職業には就けない', () => {
    expect(canChangeJob(character(), 'ninja', jobs)).toBe('unknownJob');
  });

  it('今就いている職業には転職できない', () => {
    expect(canChangeJob(character(), 'warrior', jobs)).toBe('alreadyCurrent');
  });

  it('条件を満たしていなければ locked', () => {
    expect(canChangeJob(character(), 'paladin', jobs)).toBe('locked');
  });

  it('条件を満たしていれば ok', () => {
    expect(canChangeJob(character(qualified), 'paladin', jobs)).toBe('ok');
  });
});

describe('changeJob', () => {
  it('転職しても冒険レベルは下がらない', () => {
    const result = changeJob(character(), 'priest', jobs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.adventureLevel).toBe(10);
    expect(result.character.adventureExp).toBe(40);
  });

  it('習得済みの技は消えない', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.learnedSkills).toContain('slash');
    expect(result.character.equippedActive).toContain('slash');
  });

  it('初めての職業はレベル1から始まる', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.currentJob).toBe('priest');
    expect(result.character.jobs['priest']).toEqual({ level: 1, exp: 0 });
  });

  it('前の職業の進み具合は残る', () => {
    const trained = character({ jobs: { warrior: { level: 12, exp: 300 } } });
    const result = changeJob(trained, 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.jobs['warrior']).toEqual({ level: 12, exp: 300 });
  });

  it('戻ってきたら以前の進み具合から再開する', () => {
    const both = character({
      currentJob: 'priest',
      jobs: { warrior: { level: 12, exp: 300 }, priest: { level: 3, exp: 10 } },
    });
    const result = changeJob(both, 'warrior', jobs);
    if (!result.ok) return;
    expect(result.character.jobs['warrior']).toEqual({ level: 12, exp: 300 });
  });

  it('就けない職業は理由つきで断る', () => {
    const result = changeJob(character(), 'paladin', jobs);
    expect(result).toEqual({ ok: false, reason: 'locked' });
  });

  it('初めての職業ではレベル1の技をその場で覚える', () => {
    const result = changeJob(character(), 'priest', jobs);
    if (!result.ok) return;
    expect(result.character.learnedSkills).toContain('holyLight');
    expect(result.character.learnedPassives).toContain('calm');
  });

  it('戻ってきたときは二重に覚えない', () => {
    const both = character({
      currentJob: 'priest',
      jobs: { warrior: { level: 12, exp: 300 }, priest: { level: 3, exp: 10 } },
      learnedSkills: ['slash', 'holyLight'],
    });
    const back = changeJob(both, 'warrior', jobs);
    if (!back.ok) return;
    expect(back.character.learnedSkills.filter((id) => id === 'slash')).toHaveLength(1);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    changeJob(before, 'priest', jobs);
    expect(before.currentJob).toBe('warrior');
    expect(before.jobs['priest']).toBeUndefined();
    expect(before.learnedSkills).toEqual(['slash']);
  });
});

describe('createCharacter', () => {
  it('冒険レベル1・ジョブレベル1から始まる', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.adventureLevel).toBe(1);
    expect(hero.adventureExp).toBe(0);
    expect(hero.jobs['warrior']).toEqual({ level: 1, exp: 0 });
    expect(hero.currentJob).toBe('warrior');
  });

  it('初期職のレベル1の技を覚えている', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.learnedSkills).toContain('slash');
  });

  it('覚えた技を最初から装備している', () => {
    const hero = createCharacter({ id: 'h', name: '勇者', aptitude: flat, job: 'warrior' }, jobs);
    expect(hero.equippedActive).toContain('slash');
  });

  it('覚えたパッシブも装備している', () => {
    const hero = createCharacter({ id: 'h', name: '僧', aptitude: flat, job: 'priest' }, jobs);
    expect(hero.equippedPassive).toContain('calm');
  });

  it('知らない職業では作れない', () => {
    expect(() => createCharacter({ id: 'h', name: 'x', aptitude: flat, job: 'ninja' }, jobs))
      .toThrow('unknown job: ninja');
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/unlock.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/unlock.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/unlock.ts`:

```ts
import { learnsAt } from './job.js';
import type { Job } from './job.js';
import { applyLearns } from './exp.js';
import type { JobTable } from './exp.js';
import type { Aptitude, Character, JobId } from './types.js';

export type JobChangeError = 'unknownJob' | 'locked' | 'alreadyCurrent';

/** その職業に就ける条件を満たしているか。条件が空なら常に true。 */
export function isUnlocked(character: Character, job: Job): boolean {
  return job.requires.every(
    (requirement) => (character.jobs[requirement.jobId]?.level ?? 0) >= requirement.level,
  );
}

/** いま就ける職業のID。表に載っている順で返す。 */
export function unlockedJobs(character: Character, jobs: JobTable): readonly JobId[] {
  return Object.values(jobs)
    .filter((job) => isUnlocked(character, job))
    .map((job) => job.id);
}

export function canChangeJob(
  character: Character,
  jobId: JobId,
  jobs: JobTable,
): 'ok' | JobChangeError {
  const job = jobs[jobId];
  if (!job) return 'unknownJob';
  if (character.currentJob === jobId) return 'alreadyCurrent';
  if (!isUnlocked(character, job)) return 'locked';
  return 'ok';
}

/**
 * 転職する。冒険レベル・習得済み・装備・他の職業の進み具合は一切変わらない。
 * 初めて就く職業だけ { level: 1, exp: 0 } で追加される。
 */
export function changeJob(
  character: Character,
  jobId: JobId,
  jobs: JobTable,
): { ok: true; character: Character } | { ok: false; reason: JobChangeError } {
  const verdict = canChangeJob(character, jobId, jobs);
  if (verdict !== 'ok') return { ok: false, reason: verdict };

  const job = jobs[jobId];
  const firstTime = character.jobs[jobId] === undefined;

  const moved: Character = {
    ...character,
    currentJob: jobId,
    jobs: firstTime ? { ...character.jobs, [jobId]: { level: 1, exp: 0 } } : character.jobs,
  };

  // 初めて就いた職業は、その場でレベル1の習得が起きる。
  // これが無いと転職直後のキャラが技を持たない。
  const learned = firstTime ? applyLearns(moved, learnsAt(job, 1)).character : moved;

  return { ok: true, character: learned };
}

/**
 * キャラを新しく作る。主人公も雇用メンバーも同じ関数で作る。
 * 初期職のレベル1の習得をここで済ませ、そのまま装備もしておく。
 * キャラはレベル1から始まるので、レベルアップ時の習得だけでは
 * 初期職のレベル1の技が永久に手に入らない。
 */
export function createCharacter(
  params: { id: string; name: string; aptitude: Aptitude; job: JobId },
  jobs: JobTable,
): Character {
  const job = jobs[params.job];
  if (!job) throw new Error(`unknown job: ${params.job}`);

  const blank: Character = {
    id: params.id,
    name: params.name,
    adventureLevel: 1,
    adventureExp: 0,
    aptitude: params.aptitude,
    currentJob: params.job,
    jobs: { [params.job]: { level: 1, exp: 0 } },
    learnedSkills: [],
    learnedPassives: [],
    equippedActive: [],
    equippedPassive: [],
  };

  const learned = applyLearns(blank, learnsAt(job, 1)).character;

  return {
    ...learned,
    equippedActive: learned.learnedSkills,
    equippedPassive: learned.learnedPassives,
  };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/unlock.ts packages/core/tests/progression/unlock.test.ts
git commit -m "feat: キャラ生成・上級職の解禁判定・転職

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 装備枠

**Files:**
- Create: `packages/core/src/progression/equip.ts`
- Test: `packages/core/tests/progression/equip.test.ts`

**Interfaces:**
- Consumes: `Character`（Task 1）
- Produces: `ACTIVE_SLOTS` (6), `PASSIVE_SLOTS` (2), `EquipError = 'notLearned' | 'tooMany' | 'duplicate'`, `equipActive(character: Character, skillIds: readonly string[]): { ok: true; character: Character } | { ok: false; reason: EquipError }`, `equipPassive(character: Character, passiveIds: readonly string[]): 同じ形`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/equip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { equipActive, equipPassive, ACTIVE_SLOTS, PASSIVE_SLOTS } from '../../src/progression/equip.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

const learned = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'c', name: 'テスト',
    adventureLevel: 1, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 1, exp: 0 } },
    learnedSkills: learned,
    learnedPassives: ['p1', 'p2', 'p3'],
    equippedActive: [], equippedPassive: [],
    ...over,
  };
}

describe('枠数', () => {
  it('アクティブ6枠・パッシブ2枠', () => {
    expect(ACTIVE_SLOTS).toBe(6);
    expect(PASSIVE_SLOTS).toBe(2);
  });
});

describe('equipActive', () => {
  it('習得済みの技を枠数まで装備できる', () => {
    const result = equipActive(character(), ['a', 'b', 'c']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedActive).toEqual(['a', 'b', 'c']);
  });

  it('ちょうど6つまで入る', () => {
    const result = equipActive(character(), ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result.ok).toBe(true);
  });

  it('7つ目は入らない', () => {
    const result = equipActive(character(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(result).toEqual({ ok: false, reason: 'tooMany' });
  });

  it('習得していない技は装備できない', () => {
    const result = equipActive(character(), ['a', 'unknown']);
    expect(result).toEqual({ ok: false, reason: 'notLearned' });
  });

  it('同じ技を二重に装備できない', () => {
    const result = equipActive(character(), ['a', 'a']);
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('空にもできる', () => {
    const result = equipActive(character({ equippedActive: ['a'] }), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedActive).toEqual([]);
  });

  it('転職で覚えた技も、職業を問わず装備できる', () => {
    const mage = character({ currentJob: 'mage', jobs: { mage: { level: 1, exp: 0 } } });
    const result = equipActive(mage, ['a']);
    expect(result.ok).toBe(true);
  });

  it('元のキャラを書き換えない', () => {
    const before = character();
    equipActive(before, ['a', 'b']);
    expect(before.equippedActive).toEqual([]);
  });
});

describe('equipPassive', () => {
  it('習得済みのパッシブを2つまで装備できる', () => {
    const result = equipPassive(character(), ['p1', 'p2']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.equippedPassive).toEqual(['p1', 'p2']);
  });

  it('3つ目は入らない', () => {
    expect(equipPassive(character(), ['p1', 'p2', 'p3'])).toEqual({ ok: false, reason: 'tooMany' });
  });

  it('習得していないパッシブは装備できない', () => {
    expect(equipPassive(character(), ['unknown'])).toEqual({ ok: false, reason: 'notLearned' });
  });

  it('アクティブの習得一覧とは混ざらない', () => {
    expect(equipPassive(character(), ['a'])).toEqual({ ok: false, reason: 'notLearned' });
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/equip.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/equip.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/equip.ts`:

```ts
import type { Character } from './types.js';

/** 戦闘に持ち込めるアクティブ技の枠数。 */
export const ACTIVE_SLOTS = 6;

/** 戦闘に持ち込めるパッシブの枠数。 */
export const PASSIVE_SLOTS = 2;

export type EquipError = 'notLearned' | 'tooMany' | 'duplicate';

type EquipResult =
  | { ok: true; character: Character }
  | { ok: false; reason: EquipError };

export function equipActive(
  character: Character,
  skillIds: readonly string[],
): EquipResult {
  const error = validate(skillIds, character.learnedSkills, ACTIVE_SLOTS);
  if (error) return { ok: false, reason: error };
  return { ok: true, character: { ...character, equippedActive: [...skillIds] } };
}

export function equipPassive(
  character: Character,
  passiveIds: readonly string[],
): EquipResult {
  const error = validate(passiveIds, character.learnedPassives, PASSIVE_SLOTS);
  if (error) return { ok: false, reason: error };
  return { ok: true, character: { ...character, equippedPassive: [...passiveIds] } };
}

function validate(
  chosen: readonly string[],
  learned: readonly string[],
  slots: number,
): EquipError | null {
  if (chosen.length > slots) return 'tooMany';
  if (new Set(chosen).size !== chosen.length) return 'duplicate';
  if (chosen.some((id) => !learned.includes(id))) return 'notLearned';
  return null;
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/progression/equip.ts packages/core/tests/progression/equip.test.ts
git commit -m "feat: アクティブ6枠・パッシブ2枠の装備

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: マスタデータ（技の追加・パッシブ・職業）

**Files:**
- Modify: `packages/core/src/data/skills.ts`（技を6つ追加）
- Create: `packages/core/src/data/passives.ts`
- Create: `packages/core/src/data/jobs.ts`
- Test: `packages/core/tests/progression/jobsData.test.ts`

**Interfaces:**
- Consumes: `Skill`（`battle/skill.js`）、`Passive`（Task 1）、`Job`（Task 3）
- Produces: `SKILLS`（既存に6つ追加）、`PASSIVES: Record<string, Passive>`、`JOBS: Record<JobId, Job>`

**注意:** `StatKey` は `maxHp` / `maxMp` を含まないため、パッシブで最大HPは上げられない。
パッシブは atk / def / mat / mdf / spd のみを対象にする。

- [ ] **Step 1: 技を6つ追加する**

`packages/core/src/data/skills.ts` の `SKILLS` オブジェクトに、既存8件の後ろへ追記する。
`as const satisfies Record<string, Skill>` はそのまま維持すること。

```ts
  provoke: {
    id: 'provoke', name: '挑発', mpCost: 6, cooldown: 3,
    element: 'none', target: 'self',
    effects: [
      { to: 'self', effect: { kind: 'statMod', stat: 'def', rate: 0.5, turns: 3 } },
      { to: 'self', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } },
    ],
  },
  focus: {
    id: 'focus', name: '精神統一', mpCost: 8, cooldown: 4,
    element: 'none', target: 'self',
    effects: [{ to: 'self', effect: { kind: 'statMod', stat: 'atk', rate: 0.5, turns: 3 } }],
  },
  flameArrow: {
    id: 'flameArrow', name: '火炎の矢', mpCost: 8, cooldown: 0,
    element: 'fire', target: 'enemy',
    damage: { kind: 'magical', power: 140 },
  },
  snipe: {
    id: 'snipe', name: '狙撃', mpCost: 10, cooldown: 2,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 200, pierce: 0.3 },
  },
  holyBlade: {
    id: 'holyBlade', name: '聖剣', mpCost: 14, cooldown: 2,
    element: 'holy', target: 'enemy',
    damage: { kind: 'physical', power: 240, pierce: 0.25 },
  },
  meteor: {
    id: 'meteor', name: 'メテオ', mpCost: 30, cooldown: 5,
    element: 'fire', target: 'allEnemies',
    damage: { kind: 'magical', power: 500 },
  },
```

**`provoke` について:** 本来の挑発は「敵の狙いを自分に引きつける」効果だが、
段階1の狙い先は HP割合で決まる仕組みで、それを変えるのは戦闘エンジンへの
変更になる。ここでは仕様書4.2が名前を挙げている技として、engine が今支えられる
「身を晒して守りを固める」自己バフとして実装する。引きつけ効果は段階4以降に送る。

- [ ] **Step 2: パッシブのマスタを書く**

`packages/core/src/data/passives.ts`:

```ts
import type { Passive } from '../progression/types.js';

/**
 * パッシブのマスタ。戦闘開始時から永続でかかるため turns は Infinity。
 * StatKey は maxHp / maxMp を含まないので、最大HPを上げるパッシブは作れない。
 */
export const PASSIVES = {
  battleInstinct: {
    id: 'battleInstinct', name: '戦いの勘',
    effect: { kind: 'statMod', stat: 'atk', rate: 0.2, turns: Infinity },
  },
  ironSkin: {
    id: 'ironSkin', name: '鉄の肌',
    effect: { kind: 'statMod', stat: 'def', rate: 0.2, turns: Infinity },
  },
  arcaneMind: {
    id: 'arcaneMind', name: '魔道の心得',
    effect: { kind: 'statMod', stat: 'mat', rate: 0.2, turns: Infinity },
  },
  swiftFoot: {
    id: 'swiftFoot', name: '俊足',
    effect: { kind: 'statMod', stat: 'spd', rate: 0.2, turns: Infinity },
  },
} as const satisfies Record<string, Passive>;
```

- [ ] **Step 3: 職業のマスタを書く**

`packages/core/src/data/jobs.ts`:

```ts
import type { Job } from '../progression/job.js';

/**
 * 職業のマスタ。基本6 + 上級3。
 * 上級職の条件は仕様書4.3に合わせてある。
 * statBonus はジョブレベル1つあたりの加算。
 */
export const JOBS = {
  warrior: {
    id: 'warrior', name: '戦士', tier: 'basic',
    statBonus: { atk: 3, def: 2, maxHp: 8 },
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 4, kind: 'skill', id: 'provoke' },
      { level: 8, kind: 'skill', id: 'armorBreak' },
      { level: 12, kind: 'skill', id: 'heavyBlow' },
      { level: 16, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [],
  },
  monk: {
    id: 'monk', name: '武闘家', tier: 'basic',
    statBonus: { atk: 4, spd: 1, maxHp: 5 },
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 5, kind: 'skill', id: 'focus' },
      { level: 10, kind: 'passive', id: 'battleInstinct' },
      { level: 15, kind: 'skill', id: 'heavyBlow' },
      { level: 20, kind: 'passive', id: 'swiftFoot' },
    ],
    requires: [],
  },
  mage: {
    id: 'mage', name: '魔法使い', tier: 'basic',
    statBonus: { mat: 4, maxMp: 3 },
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 6, kind: 'passive', id: 'arcaneMind' },
      { level: 12, kind: 'skill', id: 'blizzard' },
    ],
    requires: [],
  },
  priest: {
    id: 'priest', name: '僧侶', tier: 'basic',
    statBonus: { mdf: 3, mat: 2, maxMp: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 7, kind: 'skill', id: 'guardChant' },
      { level: 14, kind: 'passive', id: 'arcaneMind' },
    ],
    requires: [],
  },
  thief: {
    id: 'thief', name: '盗賊', tier: 'basic',
    statBonus: { spd: 2, atk: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'slash' },
      { level: 5, kind: 'skill', id: 'poisonDagger' },
      { level: 10, kind: 'passive', id: 'swiftFoot' },
      { level: 16, kind: 'skill', id: 'armorBreak' },
    ],
    requires: [],
  },
  ranger: {
    id: 'ranger', name: '狩人', tier: 'basic',
    statBonus: { atk: 2, spd: 2, mat: 1 },
    learnset: [
      { level: 1, kind: 'skill', id: 'flameArrow' },
      { level: 8, kind: 'skill', id: 'snipe' },
      { level: 14, kind: 'passive', id: 'battleInstinct' },
    ],
    requires: [],
  },
  paladin: {
    id: 'paladin', name: 'パラディン', tier: 'advanced',
    statBonus: { atk: 3, def: 4, mdf: 3, maxHp: 10 },
    learnset: [
      { level: 1, kind: 'skill', id: 'holyLight' },
      { level: 5, kind: 'skill', id: 'guardChant' },
      { level: 10, kind: 'skill', id: 'holyBlade' },
      { level: 20, kind: 'passive', id: 'ironSkin' },
    ],
    requires: [
      { jobId: 'warrior', level: 20 },
      { jobId: 'priest', level: 15 },
    ],
  },
  spellblade: {
    id: 'spellblade', name: '魔剣士', tier: 'advanced',
    statBonus: { atk: 3, mat: 3, maxMp: 2 },
    learnset: [
      { level: 1, kind: 'skill', id: 'iceLance' },
      { level: 5, kind: 'skill', id: 'heavyBlow' },
      { level: 12, kind: 'skill', id: 'blizzard' },
    ],
    requires: [
      { jobId: 'warrior', level: 15 },
      { jobId: 'mage', level: 20 },
    ],
  },
  sage: {
    id: 'sage', name: '賢者', tier: 'advanced',
    statBonus: { mat: 5, mdf: 3, maxMp: 4 },
    learnset: [
      { level: 1, kind: 'skill', id: 'blizzard' },
      { level: 5, kind: 'skill', id: 'holyLight' },
      { level: 10, kind: 'passive', id: 'arcaneMind' },
      { level: 20, kind: 'skill', id: 'meteor' },
    ],
    requires: [
      { jobId: 'mage', level: 20 },
      { jobId: 'priest', level: 20 },
    ],
  },
} as const satisfies Record<string, Job>;
```

- [ ] **Step 4: マスタの健全性テストを書く**

このテストは「データが自分自身と噛み合っているか」を守る番人になる。
職業を増やしたときに、存在しない技を指してもすぐ分かる。

`packages/core/tests/progression/jobsData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JOBS } from '../../src/data/jobs.js';
import { PASSIVES } from '../../src/data/passives.js';
import { SKILLS } from '../../src/data/skills.js';
import { MAX_JOB_LEVEL } from '../../src/progression/curve.js';

const jobs = Object.values(JOBS);

describe('職業マスタの健全性', () => {
  it('キーと id が一致している', () => {
    for (const [key, job] of Object.entries(JOBS)) {
      expect(job.id).toBe(key);
    }
  });

  it('習得表が指す技はすべて存在する', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        if (entry.kind === 'skill') {
          expect(Object.keys(SKILLS)).toContain(entry.id);
        }
      }
    }
  });

  it('習得表が指すパッシブはすべて存在する', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        if (entry.kind === 'passive') {
          expect(Object.keys(PASSIVES)).toContain(entry.id);
        }
      }
    }
  });

  it('習得レベルはすべて上限以内', () => {
    for (const job of jobs) {
      for (const entry of job.learnset) {
        expect(entry.level).toBeGreaterThanOrEqual(1);
        expect(entry.level).toBeLessThanOrEqual(MAX_JOB_LEVEL);
      }
    }
  });

  it('上級職の条件が指す職業はすべて存在する', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(Object.keys(JOBS)).toContain(requirement.jobId);
      }
    }
  });

  it('上級職の条件は上限以内で達成できる', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(requirement.level).toBeLessThanOrEqual(MAX_JOB_LEVEL);
      }
    }
  });

  it('基本職は条件を持たず、上級職は持つ', () => {
    for (const job of jobs) {
      if (job.tier === 'basic') expect(job.requires).toHaveLength(0);
      else expect(job.requires.length).toBeGreaterThan(0);
    }
  });

  it('上級職の条件は基本職だけを指す（上級職の連鎖を作らない）', () => {
    for (const job of jobs) {
      for (const requirement of job.requires) {
        expect(JOBS[requirement.jobId as keyof typeof JOBS].tier).toBe('basic');
      }
    }
  });

  it('どの基本職もレベル1で技を1つ覚える', () => {
    for (const job of jobs) {
      const atOne = job.learnset.filter((entry) => entry.level === 1);
      expect(atOne.length).toBeGreaterThan(0);
    }
  });

  it('パッシブのキーと id が一致している', () => {
    for (const [key, passive] of Object.entries(PASSIVES)) {
      expect(passive.id).toBe(key);
    }
  });

  it('パッシブは永続である', () => {
    for (const passive of Object.values(PASSIVES)) {
      expect(passive.effect.turns).toBe(Infinity);
    }
  });
});
```

- [ ] **Step 5: テストと型検査を走らせる**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS（このタスクで追加した分を含め全件。総数は計画では追わない）

Run: `corepack pnpm --filter @mq/core typecheck`
Expected: エラーなし

**落ちた場合はデータを直す。** テストは「データがこうあってほしい」という宣言であり、
実装の記述ではない。上級職の条件が届かない、指した技が無い、といった不整合は
`jobs.ts` 側を直すこと。

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/data packages/core/tests/progression/jobsData.test.ts
git commit -m "feat: 職業・パッシブのマスタと技6つの追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 戦闘への橋渡しと公開API、通しのテスト

**Files:**
- Create: `packages/core/src/progression/bridge.ts`
- Modify: `packages/core/src/index.ts`（育成の公開APIを追加）
- Test: `packages/core/tests/progression/bridge.test.ts`
- Test: `packages/core/tests/progression/journey.test.ts`

**Interfaces:**
- Consumes: これまでの全モジュール、`PartyMember`（`battle/state.js`）、`Skill`（`battle/skill.js`）
- Produces: `SkillTable = Readonly<Record<string, Skill>>`, `PassiveTable = Readonly<Record<string, Passive>>`, `toPartyMember(character, job, skills, passives): PartyMember`

**設計の要点:** これが育成と戦闘の唯一の接点。装備中のIDを実体に解決し、
`computeStats` の結果を `stats` に載せる。知らないIDは黙って捨てるのではなく
落とす — マスタの不整合はここで気付きたい。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/progression/bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toPartyMember } from '../../src/progression/bridge.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { computeStats } from '../../src/progression/stats.js';
import type { Character, Aptitude } from '../../src/progression/types.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function character(over: Partial<Character> = {}): Character {
  return {
    id: 'hero', name: '主人公',
    adventureLevel: 12, adventureExp: 0,
    aptitude: flat,
    currentJob: 'warrior',
    jobs: { warrior: { level: 8, exp: 0 } },
    learnedSkills: ['slash', 'provoke', 'armorBreak'],
    learnedPassives: ['ironSkin'],
    equippedActive: ['slash', 'armorBreak'],
    equippedPassive: ['ironSkin'],
    ...over,
  };
}

describe('toPartyMember', () => {
  it('IDと名前をそのまま引き継ぐ', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.id).toBe('hero');
    expect(member.name).toBe('主人公');
  });

  it('computeStats と同じステータスを載せる', () => {
    const c = character();
    const member = toPartyMember(c, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.stats).toEqual(computeStats(c, JOBS.warrior));
  });

  it('装備中のアクティブだけを技として渡す', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills.map((skill) => skill.id)).toEqual(['slash', 'armorBreak']);
  });

  it('習得済みでも装備していない技は渡さない', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills.map((skill) => skill.id)).not.toContain('provoke');
  });

  it('装備中のパッシブを効果に変えて渡す', () => {
    const member = toPartyMember(character(), JOBS.warrior, SKILLS, PASSIVES);
    expect(member.passives).toEqual([PASSIVES.ironSkin.effect]);
  });

  it('何も装備していなければ空で渡す', () => {
    const bare = character({ equippedActive: [], equippedPassive: [] });
    const member = toPartyMember(bare, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.skills).toEqual([]);
    expect(member.passives).toEqual([]);
  });

  it('マスタに無い技を装備していたら落とす', () => {
    const broken = character({ learnedSkills: ['ghost'], equippedActive: ['ghost'] });
    expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown skill: ghost');
  });

  it('マスタに無いパッシブを装備していたら落とす', () => {
    const broken = character({ learnedPassives: ['ghost'], equippedPassive: ['ghost'] });
    expect(() => toPartyMember(broken, JOBS.warrior, SKILLS, PASSIVES)).toThrow('unknown passive: ghost');
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `corepack pnpm --filter @mq/core test tests/progression/bridge.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/progression/bridge.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/progression/bridge.ts`:

```ts
import type { PartyMember } from '../battle/state.js';
import type { Skill } from '../battle/skill.js';
import type { Effect } from '../battle/effects.js';
import { computeStats } from './stats.js';
import type { Job } from './job.js';
import type { Character, Passive } from './types.js';

export type SkillTable = Readonly<Record<string, Skill>>;
export type PassiveTable = Readonly<Record<string, Passive>>;

/**
 * 育成上のキャラを戦闘に連れて行ける形にする。
 * 育成と戦闘の唯一の接点。装備中のIDをここで実体に解決する。
 *
 * 知らないIDは黙って捨てず投げる。マスタの不整合を戦闘中まで持ち越すと
 * 「なぜか技が出ない」という形で表面化して原因が追いにくいため。
 */
export function toPartyMember(
  character: Character,
  job: Job,
  skills: SkillTable,
  passives: PassiveTable,
): PartyMember {
  const equipped: Skill[] = character.equippedActive.map((id) => {
    const skill = skills[id];
    if (!skill) throw new Error(`unknown skill: ${id}`);
    return skill;
  });

  const effects: Effect[] = character.equippedPassive.map((id) => {
    const passive = passives[id];
    if (!passive) throw new Error(`unknown passive: ${id}`);
    return passive.effect;
  });

  return {
    id: character.id,
    name: character.name,
    stats: computeStats(character, job),
    skills: equipped,
    passives: effects,
  };
}
```

- [ ] **Step 4: 公開APIに追加する**

`packages/core/src/index.ts` の末尾に追記する:

```ts
export { aptitudeMultiplier } from './progression/aptitude.js';
export {
  MAX_ADVENTURE_LEVEL,
  MAX_JOB_LEVEL,
  adventureExpToNext,
  jobExpToNext,
} from './progression/curve.js';
export { learnsAt } from './progression/job.js';
export { computeStats, BASE_STATS, GROWTH_PER_LEVEL } from './progression/stats.js';
export { gainExp, applyLearns } from './progression/exp.js';
export {
  isUnlocked,
  unlockedJobs,
  canChangeJob,
  changeJob,
  createCharacter,
} from './progression/unlock.js';
export { equipActive, equipPassive, ACTIVE_SLOTS, PASSIVE_SLOTS } from './progression/equip.js';
export { toPartyMember } from './progression/bridge.js';

export type {
  Grade,
  Aptitude,
  JobId,
  JobProgress,
  Character,
  Passive,
  ProgressEvent,
} from './progression/types.js';
export type { Job, JobRequirement, JobStatBonus, LearnEntry } from './progression/job.js';
export type { ExpGain, JobTable } from './progression/exp.js';
export type { JobChangeError } from './progression/unlock.js';
export type { EquipError } from './progression/equip.js';
export type { SkillTable, PassiveTable } from './progression/bridge.js';

export { JOBS } from './data/jobs.js';
export { PASSIVES } from './data/passives.js';
```

- [ ] **Step 5: 通しのテストを書く**

段階2の価値は「育てて、転職して、上級職に就いて、その結果が戦闘に効く」が
繋がることにある。ここを1本の筋で守る。

`packages/core/tests/progression/journey.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gainExp } from '../../src/progression/exp.js';
import { changeJob, isUnlocked, createCharacter } from '../../src/progression/unlock.js';
import { equipActive, equipPassive } from '../../src/progression/equip.js';
import { toPartyMember } from '../../src/progression/bridge.js';
import { computeStats } from '../../src/progression/stats.js';
import { JOBS } from '../../src/data/jobs.js';
import { SKILLS } from '../../src/data/skills.js';
import { PASSIVES } from '../../src/data/passives.js';
import { simulate } from '../../src/battle/simulate.js';
import type { Character, Aptitude } from '../../src/progression/types.js';
import type { Enemy } from '../../src/battle/enemy.js';

const flat: Aptitude = {
  maxHp: 'C', maxMp: 'C', atk: 'C', def: 'C', mat: 'C', mdf: 'C', spd: 'C',
};

function fresh(): Character {
  return createCharacter({ id: 'hero', name: '主人公', aptitude: flat, job: 'warrior' }, JOBS);
}

/** ジョブレベルを目標まで上げる。冒険レベルは動かさない。 */
function trainJob(character: Character, target: number): Character {
  let current = character;
  while ((current.jobs[current.currentJob]?.level ?? 1) < target) {
    current = gainExp(current, { adventure: 0, job: 5000 }, JOBS).character;
  }
  return current;
}

describe('育成の通し', () => {
  it('作った直後から初期職の技を持っている', () => {
    const hero = fresh();
    expect(hero.learnedSkills).toContain('slash');
    expect(hero.equippedActive).toContain('slash');
  });

  it('戦士を育てるとジョブレベルで技を覚える', () => {
    const trained = trainJob(fresh(), 12);
    expect(trained.learnedSkills).toContain('slash');
    expect(trained.learnedSkills).toContain('provoke');
    expect(trained.learnedSkills).toContain('heavyBlow');
  });

  it('転職しても冒険レベルと習得済みは失われない', () => {
    const trained = gainExp(trainJob(fresh(), 12), { adventure: 100000, job: 0 }, JOBS).character;
    const level = trained.adventureLevel;
    const changed = changeJob(trained, 'priest', JOBS);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.character.adventureLevel).toBe(level);
    expect(changed.character.learnedSkills).toContain('heavyBlow');
    expect(changed.character.jobs['priest']).toEqual({ level: 1, exp: 0 });
  });

  it('2つの職業を育てると上級職が解禁される', () => {
    let hero = trainJob(fresh(), 20);
    expect(isUnlocked(hero, JOBS.paladin)).toBe(false);

    const toPriest = changeJob(hero, 'priest', JOBS);
    expect(toPriest.ok).toBe(true);
    if (!toPriest.ok) return;
    hero = trainJob(toPriest.character, 15);

    expect(isUnlocked(hero, JOBS.paladin)).toBe(true);

    const toPaladin = changeJob(hero, 'paladin', JOBS);
    expect(toPaladin.ok).toBe(true);
    if (!toPaladin.ok) return;
    expect(toPaladin.character.currentJob).toBe('paladin');
  });

  it('上級職に就くとステータスが上がる', () => {
    let hero = trainJob(fresh(), 20);
    const asWarrior = computeStats(hero, JOBS.warrior);

    const toPriest = changeJob(hero, 'priest', JOBS);
    if (!toPriest.ok) return;
    hero = trainJob(toPriest.character, 15);
    const toPaladin = changeJob(hero, 'paladin', JOBS);
    if (!toPaladin.ok) return;
    const trained = trainJob(toPaladin.character, 20);

    const asPaladin = computeStats(trained, JOBS.paladin);
    expect(asPaladin.def).toBeGreaterThan(asWarrior.def);
  });

  it('育てた結果がそのまま戦闘の強さになる', () => {
    const dummy: Enemy = {
      id: 'dummy', name: '木人',
      stats: { maxHp: 3000, maxMp: 0, atk: 1, def: 40, mat: 1, mdf: 40, spd: 1 },
      skills: [SKILLS.slash],
      pattern: [{ skillId: 'slash' }],
    };

    // createCharacter が装備済みでも、比較を「slash 1本」に揃えるため付け直す
    function damageDealt(character: Character): number {
      const equippedActive = equipActive(character, ['slash']);
      if (!equippedActive.ok) throw new Error('equip failed');
      const member = toPartyMember(equippedActive.character, JOBS.warrior, SKILLS, PASSIVES);
      const log = simulate([member], dummy, { hero: ['slash'] }, { maxTurns: 1 });
      const hit = log.events.find((event) => event.t === 'damage');
      if (!hit || hit.t !== 'damage') throw new Error('no damage event');
      return hit.amount;
    }

    const rookie = trainJob(fresh(), 1);
    const veteran = gainExp(trainJob(fresh(), 20), { adventure: 200000, job: 0 }, JOBS).character;

    expect(damageDealt(veteran)).toBeGreaterThan(damageDealt(rookie));
  });

  it('パッシブを装備すると戦闘に効く', () => {
    const trained = trainJob(fresh(), 16);
    const withSkill = equipActive(trained, ['slash']);
    if (!withSkill.ok) return;
    const withPassive = equipPassive(withSkill.character, ['ironSkin']);
    expect(withPassive.ok).toBe(true);
    if (!withPassive.ok) return;

    const member = toPartyMember(withPassive.character, JOBS.warrior, SKILLS, PASSIVES);
    expect(member.passives).toEqual([PASSIVES.ironSkin.effect]);
  });
});
```

- [ ] **Step 6: テストと型検査を走らせる**

Run: `corepack pnpm --filter @mq/core test`
Expected: PASS

Run: `corepack pnpm --filter @mq/core typecheck`
Expected: エラーなし

**「育てた結果がそのまま戦闘の強さになる」が落ちる場合**は、まず
`trainJob` が意図どおりレベルを上げているか、`equipActive` が成功しているかを
確認する。テストの assertion は変えないこと。

- [ ] **Step 7: 乱数を使っていないことを確認する**

Run: `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src`
Expected: 出力なし

- [ ] **Step 8: コミット**

```bash
git add packages/core/src/progression/bridge.ts packages/core/src/index.ts packages/core/tests/progression
git commit -m "feat: 育成から戦闘への橋渡しと公開API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の定義

- [ ] `corepack pnpm --filter @mq/core test` が全件 PASS
- [ ] `corepack pnpm --filter @mq/core typecheck` がエラーなし
- [ ] `packages/core/package.json` の `dependencies` が空
- [ ] `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src` が空
- [ ] 戦士Lv20 + 僧侶Lv15 でパラディンが解禁され、就ける
- [ ] 作った直後のキャラが初期職のレベル1の技を持ち、装備している
- [ ] 転職しても冒険レベルと習得済みの技が失われない
- [ ] 育てたキャラが `toPartyMember` を通して段階1の `simulate` で戦える

## この計画に含まれないもの

- **雇用市場の生成**（酒場に日替わりで3人並ぶ）。その日のシードを必要とし、
  シード付き乱数は段階3のイベント抽選と共有すべきなので別計画にする。
  素質と冒険レベルという「差がつくポイント」の仕組み自体はこの計画に含まれる
- 戦闘報酬として渡す経験値の量（段階3の報酬表）
- ペットの入手（イベント報酬。段階3）
- 挑発の「敵の狙いを引きつける」効果。段階1の狙い先の仕組みへの変更になるため、
  ここでは自己バフとして実装する
- 装備の永続化・UI（段階4）
