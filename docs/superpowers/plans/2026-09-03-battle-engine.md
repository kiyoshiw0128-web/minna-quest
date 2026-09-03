# 戦闘エンジン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全事前セット式・乱数ゼロの戦闘を、`simulate(party, enemy, plan) -> BattleLog` の一関数として動かす。

**Architecture:** すべて純関数。状態は不変で、各行動が新しい `BattleState` と `BattleEvent[]` を返す。1ターン = 生存者を実効速度の降順に並べ、上から解決。乱数を一切使わないため、同じ入力からは常に同じログが出る。

**Tech Stack:** TypeScript 5.6 / Vitest 2 / pnpm workspace。`packages/core` は実行時依存ゼロ。

**Spec:** `docs/superpowers/specs/2026-09-03-minna-quest-design.md`

## Global Constraints

- `packages/core` に **実行時依存を入れない**。devDependencies は vitest と typescript のみ
- **乱数を使わない。** `Math.random`、`Date.now`、`crypto` の呼び出しは禁止。同じ入力からは必ず同じ出力
- **状態を破壊的に変更しない。** 既存オブジェクトを書き換えず、新しいオブジェクトを返す
- ダメージ・HP・MP はすべて整数。小数は `Math.floor` で落とす
- ダメージ計算は除算式 `基礎 × 100 / (100 + DEF)`。減算式は使わない
- ダメージの最低値は 1
- 1戦闘の最大ターン数は 8（`DEFAULT_MAX_TURNS`）
- TypeScript は `strict: true`
- import は拡張子 `.js` 付きで書く（`verbatimModuleSyntax` + ESM のため）
- コミットメッセージは `<type>: <description>` 形式（feat / fix / test / chore / docs）

---

## ファイル構成

```
package.json                         ルート。pnpm workspace
pnpm-workspace.yaml
tsconfig.base.json
packages/core/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                         公開API
    battle/
      types.ts        StatBlock / Element / DamageSpec / DamageInput
      damage.ts       computeDamage — ダメージ計算だけ
      effects.ts      バフ・デバフ・スタンと実効ステータス
      skill.ts        Skill 型
      enemy.ts        Enemy 型と行動表
      state.ts        Combatant / BattleState と生成・更新
      order.ts        行動順の決定
      log.ts          BattleEvent / BattleLog 型
      action.ts       1回の行動の解決
      enemyTurn.ts    敵の行動選択と激昂判定
      simulate.ts     戦闘ループ本体
    data/
      skills.ts       技のマスタ
      enemies.ts      敵のマスタ
  tests/battle/*.test.ts
```

各ファイルは1つの責務だけを持つ。`damage.ts` はダメージ計算しか知らず、`Combatant` の存在を知らない。`order.ts` は並べ替えしかしない。この境界のおかげで、それぞれを単体でテストできる。

---

### Task 1: リポジトリ土台と物理ダメージ

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/battle/types.ts`
- Create: `packages/core/src/battle/damage.ts`
- Test: `packages/core/tests/battle/damage.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `StatBlock`, `Element`, `DamageSpec`, `DamageInput`, `computeDamage(input: DamageInput): number`

- [ ] **Step 1: ワークスペースの土台を作る**

`package.json`:

```json
{
  "name": "minna-quest",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  },
  "packageManager": "pnpm@9.12.0"
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true
  }
}
```

`packages/core/package.json`:

```json
{
  "name": "@mq/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "tests"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

Run: `pnpm install`

- [ ] **Step 2: 失敗するテストを書く**

`packages/core/tests/battle/damage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDamage } from '../../src/battle/damage.js';
import type { DamageInput } from '../../src/battle/types.js';

const base: Omit<DamageInput, 'spec'> = {
  atk: 120,
  mat: 100,
  def: 60,
  mdf: 40,
  targetMaxHp: 1000,
  elementRate: 1,
  damageTakenRate: 1,
};

describe('computeDamage - 物理', () => {
  it('除算式で DEF によって軽減される', () => {
    // 120 * 100/100 = 120 の基礎値が、DEF60 で 120 * 100/160 = 75 になる
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 100 } })).toBe(75);
  });

  it('貫通率のぶんだけ DEF を無視する', () => {
    // DEF60 の半分を無視 -> 120 * 100/130 = 92.3 -> 92
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 100, pierce: 0.5 } })).toBe(92);
  });

  it('技威力に比例する', () => {
    // 基礎 240 -> 240 * 100/160 = 150
    expect(computeDamage({ ...base, spec: { kind: 'physical', power: 200 } })).toBe(150);
  });

  it('どれだけ硬くても最低1ダメージは通る', () => {
    expect(
      computeDamage({ ...base, atk: 1, def: 9999, spec: { kind: 'physical', power: 1 } }),
    ).toBe(1);
  });
});
```

- [ ] **Step 3: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test`
Expected: FAIL。`Failed to resolve import "../../src/battle/damage.js"`

- [ ] **Step 4: 型を書く**

`packages/core/src/battle/types.ts`:

```ts
export type StatBlock = {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  mat: number;
  mdf: number;
  spd: number;
};

export type Element = 'none' | 'fire' | 'ice' | 'thunder' | 'holy' | 'dark';

/** 技のダメージの決まり方。4タイプのいずれか。 */
export type DamageSpec =
  | { kind: 'physical'; power: number; pierce?: number }
  | { kind: 'magical'; power: number; pierce?: number }
  | { kind: 'fixed'; amount: number }
  | { kind: 'ratio'; percent: number; cap: number };

/** computeDamage への入力。ステータスは実効値（バフ適用後）を渡す。 */
export type DamageInput = {
  atk: number;
  mat: number;
  def: number;
  mdf: number;
  targetMaxHp: number;
  spec: DamageSpec;
  elementRate: number;
  damageTakenRate: number;
};
```

- [ ] **Step 5: 最小の実装を書く**

`packages/core/src/battle/damage.ts`:

```ts
import type { DamageInput } from './types.js';

/**
 * ダメージを計算する。乱数は使わない。
 * 除算式を採るのは、減算式だと DEF が少し上がっただけでダメージが 0 に落ちて
 * 詰みが生まれるため。
 */
export function computeDamage(input: DamageInput): number {
  const { spec, elementRate, damageTakenRate } = input;
  const rate = elementRate * damageTakenRate;

  switch (spec.kind) {
    case 'physical':
      return finalize(reduce(input.atk, spec.power, input.def, spec.pierce ?? 0) * rate);
    case 'magical':
      return finalize(reduce(input.mat, spec.power, input.mdf, spec.pierce ?? 0) * rate);
    case 'fixed':
      return finalize(spec.amount * rate);
    case 'ratio': {
      const raw = (input.targetMaxHp * spec.percent) / 100;
      return Math.max(1, Math.min(Math.floor(raw * rate), spec.cap));
    }
  }
}

function reduce(attack: number, power: number, defense: number, pierce: number): number {
  const effectiveDefense = defense * (1 - clamp01(pierce));
  const basePower = (attack * power) / 100;
  return (basePower * 100) / (100 + effectiveDefense);
}

function finalize(value: number): number {
  return Math.max(1, Math.floor(value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
```

- [ ] **Step 6: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（4件）

- [ ] **Step 7: コミット**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages/core
git commit -m "feat: 物理ダメージ計算とワークスペースの土台

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 魔法・固定・割合ダメージと各種倍率

**Files:**
- Test: `packages/core/tests/battle/damage.test.ts`（追記）

**Interfaces:**
- Consumes: `computeDamage`, `DamageInput`（Task 1）
- Produces: なし（Task 1 の実装が4タイプすべてを満たすことの確認）

Task 1 の `computeDamage` はすでに4タイプを実装している。このタスクは残り3タイプと倍率の振る舞いをテストで固定する。実装を書き足す必要はない可能性が高いが、テストが落ちたら実装を直す。

- [ ] **Step 1: 失敗するテストを追記する**

`packages/core/tests/battle/damage.test.ts` の末尾に追記:

```ts
describe('computeDamage - 魔法・固定・割合', () => {
  it('魔法は MAT と MDF で計算する', () => {
    // 100 * 100/100 = 100 -> 100 * 100/140 = 71.4 -> 71
    expect(computeDamage({ ...base, spec: { kind: 'magical', power: 100 } })).toBe(71);
  });

  it('固定ダメージは防御を一切見ない', () => {
    expect(computeDamage({ ...base, def: 9999, spec: { kind: 'fixed', amount: 250 } })).toBe(250);
  });

  it('割合ダメージは最大HPに比例し、上限で頭打ちになる', () => {
    // 1000 の 10% = 100 だが、上限 80 で止まる
    expect(computeDamage({ ...base, spec: { kind: 'ratio', percent: 10, cap: 80 } })).toBe(80);
  });

  it('割合ダメージは上限に達しなければそのまま通る', () => {
    expect(computeDamage({ ...base, spec: { kind: 'ratio', percent: 10, cap: 500 } })).toBe(100);
  });
});

describe('computeDamage - 倍率', () => {
  it('属性倍率を掛ける', () => {
    // 75 * 1.5 = 112.5 -> 112
    expect(
      computeDamage({ ...base, elementRate: 1.5, spec: { kind: 'physical', power: 100 } }),
    ).toBe(112);
  });

  it('被ダメージ倍率を掛ける（溜め中の敵を殴る想定）', () => {
    // 75 * 1.5 = 112.5 -> 112
    expect(
      computeDamage({ ...base, damageTakenRate: 1.5, spec: { kind: 'physical', power: 100 } }),
    ).toBe(112);
  });

  it('属性倍率と被ダメージ倍率は乗算で重なる', () => {
    // 75 * 1.5 * 1.5 = 168.75 -> 168
    expect(
      computeDamage({
        ...base,
        elementRate: 1.5,
        damageTakenRate: 1.5,
        spec: { kind: 'physical', power: 100 },
      }),
    ).toBe(168);
  });

  it('固定ダメージにも倍率は乗る', () => {
    expect(
      computeDamage({ ...base, damageTakenRate: 1.5, spec: { kind: 'fixed', amount: 200 } }),
    ).toBe(300);
  });
});
```

- [ ] **Step 2: テストを走らせる**

Run: `pnpm --filter @mq/core test`
Expected: PASS（12件）。落ちた場合は `damage.ts` の該当分岐を直す。テストの期待値は変えない

- [ ] **Step 3: コミット**

```bash
git add packages/core/tests/battle/damage.test.ts packages/core/src/battle/damage.ts
git commit -m "test: 魔法・固定・割合ダメージと倍率の振る舞いを固定

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 状態効果と実効ステータス

**Files:**
- Create: `packages/core/src/battle/effects.ts`
- Test: `packages/core/tests/battle/effects.test.ts`

**Interfaces:**
- Consumes: `StatBlock`（Task 1）
- Produces: `StatKey`, `Effect`, `ActiveEffect`, `effectiveStat(base, stat, actives): number`, `damageTakenRate(actives): number`, `isStunned(actives): boolean`, `applyEffect(actives, effect): ActiveEffect[]`, `tickEffects(actives): { remaining, expired }`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/battle/effects.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  effectiveStat,
  damageTakenRate,
  isStunned,
  applyEffect,
  tickEffects,
} from '../../src/battle/effects.js';
import type { ActiveEffect } from '../../src/battle/effects.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 100, def: 50, mat: 60, mdf: 40, spd: 20,
};

describe('effectiveStat', () => {
  it('効果が無ければ素の値を返す', () => {
    expect(effectiveStat(stats, 'atk', [])).toBe(100);
  });

  it('デバフのぶんだけ下がる', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 }, remaining: 3 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(70);
  });

  it('同じステータスへの効果は足し算で重なる', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 }, remaining: 3 },
      { effect: { kind: 'statMod', stat: 'atk', rate: 0.5, turns: 2 }, remaining: 2 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(120);
  });

  it('別のステータスへの効果は影響しない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'def', rate: -0.5, turns: 3 }, remaining: 3 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(100);
  });

  it('どれだけ下げられても素の10%を下回らない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'atk', rate: -5, turns: 1 }, remaining: 1 },
    ];
    expect(effectiveStat(stats, 'atk', actives)).toBe(10);
  });
});

describe('damageTakenRate', () => {
  it('効果が無ければ 1', () => {
    expect(damageTakenRate([])).toBe(1);
  });

  it('溜め中は被ダメージが増える', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 1 }, remaining: 1 },
    ];
    expect(damageTakenRate(actives)).toBe(1.5);
  });
});

describe('isStunned', () => {
  it('スタン効果があれば true', () => {
    const actives: ActiveEffect[] = [{ effect: { kind: 'stun', turns: 1 }, remaining: 1 }];
    expect(isStunned(actives)).toBe(true);
  });

  it('無ければ false', () => {
    expect(isStunned([])).toBe(false);
  });
});

describe('applyEffect', () => {
  it('残りターン数つきで追加し、元の配列は変えない', () => {
    const before: ActiveEffect[] = [];
    const after = applyEffect(before, { kind: 'stun', turns: 2 });
    expect(after).toHaveLength(1);
    expect(after[0].remaining).toBe(2);
    expect(before).toHaveLength(0);
  });
});

describe('tickEffects', () => {
  it('残りターンを1減らし、0になったものを切り離す', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'stun', turns: 1 }, remaining: 1 },
      { effect: { kind: 'damageTaken', rate: 0.5, turns: 3 }, remaining: 3 },
    ];
    const { remaining, expired } = tickEffects(actives);
    expect(expired).toHaveLength(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].remaining).toBe(2);
  });

  it('永続効果（パッシブ）は減らない', () => {
    const actives: ActiveEffect[] = [
      { effect: { kind: 'statMod', stat: 'spd', rate: 0.1, turns: Infinity }, remaining: Infinity },
    ];
    const { remaining, expired } = tickEffects(actives);
    expect(expired).toHaveLength(0);
    expect(remaining[0].remaining).toBe(Infinity);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/effects.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/effects.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/battle/effects.ts`:

```ts
import type { StatBlock } from './types.js';

export type StatKey = 'atk' | 'def' | 'mat' | 'mdf' | 'spd';

/** 一時的な効果。turns は付与された時点での持続ターン数。 */
export type Effect =
  | { kind: 'statMod'; stat: StatKey; rate: number; turns: number }
  | { kind: 'damageTaken'; rate: number; turns: number }
  | { kind: 'stun'; turns: number };

/** 戦闘中に実際にかかっている効果。remaining は残りターン数。 */
export type ActiveEffect = { effect: Effect; remaining: number };

/** どれだけ弱体化されても素の値の10%は残す。 */
const MIN_MULTIPLIER = 0.1;

export function effectiveStat(base: StatBlock, stat: StatKey, actives: ActiveEffect[]): number {
  const total = actives.reduce(
    (sum, active) =>
      active.effect.kind === 'statMod' && active.effect.stat === stat
        ? sum + active.effect.rate
        : sum,
    0,
  );
  const multiplier = Math.max(MIN_MULTIPLIER, 1 + total);
  return Math.max(1, Math.floor(base[stat] * multiplier));
}

export function damageTakenRate(actives: ActiveEffect[]): number {
  const total = actives.reduce(
    (sum, active) => (active.effect.kind === 'damageTaken' ? sum + active.effect.rate : sum),
    0,
  );
  return Math.max(MIN_MULTIPLIER, 1 + total);
}

export function isStunned(actives: ActiveEffect[]): boolean {
  return actives.some((active) => active.effect.kind === 'stun');
}

export function applyEffect(actives: ActiveEffect[], effect: Effect): ActiveEffect[] {
  return [...actives, { effect, remaining: effect.turns }];
}

export function tickEffects(actives: ActiveEffect[]): {
  remaining: ActiveEffect[];
  expired: ActiveEffect[];
} {
  const decremented = actives.map((active) =>
    active.remaining === Infinity ? active : { ...active, remaining: active.remaining - 1 },
  );
  return {
    remaining: decremented.filter((active) => active.remaining > 0),
    expired: decremented.filter((active) => active.remaining <= 0),
  };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全24件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/battle/effects.ts packages/core/tests/battle/effects.test.ts
git commit -m "feat: 状態効果と実効ステータスの計算

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 技・敵の型と戦闘状態の生成

**Files:**
- Create: `packages/core/src/battle/skill.ts`
- Create: `packages/core/src/battle/enemy.ts`
- Create: `packages/core/src/battle/state.ts`
- Test: `packages/core/tests/battle/state.test.ts`

**Interfaces:**
- Consumes: `StatBlock`, `Element`, `DamageSpec`（Task 1）、`Effect`, `ActiveEffect`（Task 3）
- Produces: `SkillTarget`, `Skill`, `EnemyPatternEntry`, `Enemy`, `Side`, `Combatant`, `PartyMember`, `BattleState`, `createBattleState(party, enemy): BattleState`, `findCombatant(state, id): Combatant`, `updateCombatant(state, id, updater): BattleState`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/battle/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createBattleState, findCombatant, updateCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 100, def: 50, mat: 60, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [slash] };

const dummy: Enemy = {
  id: 'dummy', name: '木人',
  stats: { ...stats, maxHp: 1000, spd: 5 },
  skills: [slash],
  pattern: [{ skillId: 'slash' }],
};

describe('createBattleState', () => {
  it('味方と敵を満タンの HP・MP で並べる', () => {
    const state = createBattleState([hero], dummy);
    expect(state.turn).toBe(1);
    expect(state.combatants).toHaveLength(2);
    expect(findCombatant(state, 'hero').hp).toBe(500);
    expect(findCombatant(state, 'dummy').hp).toBe(1000);
  });

  it('味方は ally、敵は enemy になる', () => {
    const state = createBattleState([hero], dummy);
    expect(findCombatant(state, 'hero').side).toBe('ally');
    expect(findCombatant(state, 'dummy').side).toBe('enemy');
  });

  it('パッシブは永続の効果として最初から付いている', () => {
    const withPet: PartyMember = {
      ...hero,
      passives: [{ kind: 'statMod', stat: 'spd', rate: 0.1, turns: Infinity }],
    };
    const state = createBattleState([withPet], dummy);
    expect(findCombatant(state, 'hero').effects).toHaveLength(1);
    expect(findCombatant(state, 'hero').effects[0].remaining).toBe(Infinity);
  });

  it('激昂はまだ起きていない', () => {
    expect(createBattleState([hero], dummy).enraged).toBe(false);
  });
});

describe('updateCombatant', () => {
  it('指定した1人だけを差し替えた新しい状態を返す', () => {
    const before = createBattleState([hero], dummy);
    const after = updateCombatant(before, 'hero', (c) => ({ ...c, hp: 100 }));
    expect(findCombatant(after, 'hero').hp).toBe(100);
    expect(findCombatant(after, 'dummy').hp).toBe(1000);
  });

  it('元の状態を書き換えない', () => {
    const before = createBattleState([hero], dummy);
    updateCombatant(before, 'hero', (c) => ({ ...c, hp: 100 }));
    expect(findCombatant(before, 'hero').hp).toBe(500);
  });
});

describe('findCombatant', () => {
  it('いない ID を引いたら投げる', () => {
    const state = createBattleState([hero], dummy);
    expect(() => findCombatant(state, 'nobody')).toThrow('unknown combatant: nobody');
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/state.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/state.js"`

- [ ] **Step 3: 技の型を書く**

`packages/core/src/battle/skill.ts`:

```ts
import type { DamageSpec, Element } from './types.js';
import type { Effect } from './effects.js';

/**
 * 誰を狙うか。すべて決定論的に決まる。
 * - enemy        相手側で HP割合が最も低い生存者（同率なら ID 昇順）
 * - allEnemies   相手側の生存者すべて
 * - lowestHpAlly 自分側で HP割合が最も低い生存者（同率なら ID 昇順）
 * - allAllies    自分側の生存者すべて
 * - self         自分自身
 */
export type SkillTarget = 'enemy' | 'allEnemies' | 'lowestHpAlly' | 'allAllies' | 'self';

export type Skill = {
  id: string;
  name: string;
  /** 消費MP。パーティ全体ではなく本人の MP から引く */
  mpCost: number;
  /** 使った後、何ターン空ければ再び使えるか。0 なら毎ターン使える */
  cooldown: number;
  element: Element;
  target: SkillTarget;
  damage?: DamageSpec;
  /** 回復量。使用者の実効 MAT に対する百分率。100 なら MAT と等倍 */
  heal?: number;
  effects?: { to: 'target' | 'self'; effect: Effect }[];
};
```

- [ ] **Step 4: 敵の型を書く**

`packages/core/src/battle/enemy.ts`:

```ts
import type { Element, StatBlock } from './types.js';
import type { Skill } from './skill.js';

/** 行動表の1マス。ターン数で割った余りの位置が使われる。 */
export type EnemyPatternEntry = { skillId: string };

export type Enemy = {
  id: string;
  name: string;
  stats: StatBlock;
  skills: Skill[];
  /** 属性ごとの倍率。1.5 なら弱点、0.5 なら耐性。未指定は 1 */
  resist?: Partial<Record<Element, number>>;
  pattern: EnemyPatternEntry[];
  /** HP がこの割合以下になったら行動表が切り替わる */
  enrage?: { hpRate: number; pattern: EnemyPatternEntry[] };
};
```

- [ ] **Step 5: 戦闘状態を書く**

`packages/core/src/battle/state.ts`:

```ts
import type { StatBlock } from './types.js';
import type { ActiveEffect, Effect } from './effects.js';
import type { Skill } from './skill.js';
import type { Enemy } from './enemy.js';

export type Side = 'ally' | 'enemy';

/** 戦闘中の1体。味方も敵も同じ形で扱う。 */
export type Combatant = {
  id: string;
  name: string;
  side: Side;
  base: StatBlock;
  hp: number;
  mp: number;
  skills: Skill[];
  effects: ActiveEffect[];
  /** 技ID -> あと何ターン使えないか */
  cooldowns: Record<string, number>;
};

/** 戦闘に連れて行くキャラ。装備した6枠の技とパッシブを持つ。 */
export type PartyMember = {
  id: string;
  name: string;
  stats: StatBlock;
  skills: Skill[];
  /** パッシブ枠とペットの効果。戦闘開始時から永続でかかる */
  passives?: Effect[];
};

export type BattleState = {
  turn: number;
  combatants: Combatant[];
  enemyDef: Enemy;
  enraged: boolean;
};

export function createBattleState(party: PartyMember[], enemy: Enemy): BattleState {
  const allies: Combatant[] = party.map((member) => ({
    id: member.id,
    name: member.name,
    side: 'ally',
    base: member.stats,
    hp: member.stats.maxHp,
    mp: member.stats.maxMp,
    skills: member.skills,
    effects: (member.passives ?? []).map((effect) => ({ effect, remaining: Infinity })),
    cooldowns: {},
  }));

  const foe: Combatant = {
    id: enemy.id,
    name: enemy.name,
    side: 'enemy',
    base: enemy.stats,
    hp: enemy.stats.maxHp,
    mp: enemy.stats.maxMp,
    skills: enemy.skills,
    effects: [],
    cooldowns: {},
  };

  return { turn: 1, combatants: [...allies, foe], enemyDef: enemy, enraged: false };
}

export function findCombatant(state: BattleState, id: string): Combatant {
  const found = state.combatants.find((combatant) => combatant.id === id);
  if (!found) throw new Error(`unknown combatant: ${id}`);
  return found;
}

export function updateCombatant(
  state: BattleState,
  id: string,
  updater: (combatant: Combatant) => Combatant,
): BattleState {
  return {
    ...state,
    combatants: state.combatants.map((combatant) =>
      combatant.id === id ? updater(combatant) : combatant,
    ),
  };
}
```

- [ ] **Step 6: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全31件）

- [ ] **Step 7: コミット**

```bash
git add packages/core/src/battle/skill.ts packages/core/src/battle/enemy.ts packages/core/src/battle/state.ts packages/core/tests/battle/state.test.ts
git commit -m "feat: 技・敵の型と戦闘状態の生成

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 行動順の決定

**Files:**
- Create: `packages/core/src/battle/order.ts`
- Test: `packages/core/tests/battle/order.test.ts`

**Interfaces:**
- Consumes: `effectiveStat`（Task 3）、`Combatant`（Task 4）
- Produces: `isAlive(c: Combatant): boolean`, `turnOrder(combatants: Combatant[]): Combatant[]`

行動順そのものが攻略要素なので、ここは完全に予測可能でなければならない。速度が同じときは ID の昇順で固定する。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/battle/order.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { turnOrder, isAlive } from '../../src/battle/order.js';
import type { Combatant } from '../../src/battle/state.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 100, maxMp: 10, atk: 10, def: 10, mat: 10, mdf: 10, spd: 10,
};

function combatant(id: string, spd: number, hp = 100): Combatant {
  return {
    id, name: id, side: 'ally',
    base: { ...stats, spd },
    hp, mp: 10, skills: [], effects: [], cooldowns: {},
  };
}

describe('turnOrder', () => {
  it('速度の高い順に並べる', () => {
    const order = turnOrder([combatant('slow', 5), combatant('fast', 30), combatant('mid', 15)]);
    expect(order.map((c) => c.id)).toEqual(['fast', 'mid', 'slow']);
  });

  it('速度が同じなら ID の昇順で固定する', () => {
    const order = turnOrder([combatant('b', 10), combatant('a', 10)]);
    expect(order.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('倒れている者は並ばない', () => {
    const order = turnOrder([combatant('down', 30, 0), combatant('alive', 10)]);
    expect(order.map((c) => c.id)).toEqual(['alive']);
  });

  it('速度バフを反映する', () => {
    const buffed = combatant('buffed', 10);
    buffed.effects = [
      { effect: { kind: 'statMod', stat: 'spd', rate: 1.0, turns: 3 }, remaining: 3 },
    ];
    const order = turnOrder([combatant('base', 15), buffed]);
    expect(order.map((c) => c.id)).toEqual(['buffed', 'base']);
  });

  it('渡された配列を並べ替えない', () => {
    const input = [combatant('slow', 5), combatant('fast', 30)];
    turnOrder(input);
    expect(input.map((c) => c.id)).toEqual(['slow', 'fast']);
  });
});

describe('isAlive', () => {
  it('HP が 0 なら false', () => {
    expect(isAlive(combatant('x', 10, 0))).toBe(false);
  });

  it('HP が残っていれば true', () => {
    expect(isAlive(combatant('x', 10, 1))).toBe(true);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/order.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/order.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/battle/order.ts`:

```ts
import { effectiveStat } from './effects.js';
import type { Combatant } from './state.js';

export function isAlive(combatant: Combatant): boolean {
  return combatant.hp > 0;
}

/**
 * 行動順を決める。実効速度の降順、同速なら ID 昇順。
 * 乱数を使わないので、プレイヤーは行動順を完全に読める。
 */
export function turnOrder(combatants: Combatant[]): Combatant[] {
  return combatants
    .filter(isAlive)
    .map((combatant) => ({
      combatant,
      speed: effectiveStat(combatant.base, 'spd', combatant.effects),
    }))
    .sort((a, b) => (a.speed !== b.speed ? b.speed - a.speed : compareId(a.combatant, b.combatant)))
    .map((entry) => entry.combatant);
}

function compareId(a: Combatant, b: Combatant): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全38件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/battle/order.ts packages/core/tests/battle/order.test.ts
git commit -m "feat: 実効速度による行動順の決定

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 1回の行動の解決

**Files:**
- Create: `packages/core/src/battle/log.ts`
- Create: `packages/core/src/battle/action.ts`
- Test: `packages/core/tests/battle/action.test.ts`

**Interfaces:**
- Consumes: `computeDamage`（Task 1）、`effectiveStat`/`damageTakenRate`/`applyEffect`/`Effect`（Task 3）、`Skill`（Task 4）、`BattleState`/`Combatant`/`findCombatant`/`updateCombatant`（Task 4）、`isAlive`（Task 5）
- Produces: `BattleResult`, `BattleEvent`, `BattleLog`, `ActionResult`, `canUse(actor, skill): 'ok' | 'noMp' | 'cooldown'`, `performAction(state, actorId, skill): ActionResult`

- [ ] **Step 1: ログの型を書く**

`packages/core/src/battle/log.ts`:

```ts
import type { Effect } from './effects.js';

export type BattleResult = 'win' | 'lose' | 'timeout';

export type SkipReason = 'noMp' | 'cooldown' | 'stunned' | 'noAction';

/** 戦闘中に起きたことの記録。フロントはこれを再生するだけでよい。 */
export type BattleEvent =
  | { t: 'turnStart'; turn: number }
  | { t: 'act'; actorId: string; skillId: string }
  | { t: 'damage'; targetId: string; amount: number; hpAfter: number }
  | { t: 'heal'; targetId: string; amount: number; hpAfter: number }
  | { t: 'effect'; targetId: string; effect: Effect }
  | { t: 'expire'; targetId: string; effect: Effect }
  | { t: 'skip'; actorId: string; reason: SkipReason }
  | { t: 'enrage'; actorId: string }
  | { t: 'down'; actorId: string }
  | { t: 'end'; result: BattleResult; turns: number };

export type BattleLog = {
  result: BattleResult;
  turns: number;
  events: BattleEvent[];
};
```

- [ ] **Step 2: 失敗するテストを書く**

`packages/core/tests/battle/action.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { performAction, canUse } from '../../src/battle/action.js';
import { createBattleState, findCombatant } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 100 },
};

const fireball: Skill = {
  id: 'fireball', name: '火球', mpCost: 12, cooldown: 2,
  element: 'fire', target: 'enemy',
  damage: { kind: 'magical', power: 150 },
};

const heal: Skill = {
  id: 'heal', name: '癒やしの光', mpCost: 8, cooldown: 0,
  element: 'holy', target: 'lowestHpAlly',
  heal: 120,
};

const roar: Skill = {
  id: 'roar', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};

const charge: Skill = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
};

const hero: PartyMember = {
  id: 'hero', name: '主人公', stats, skills: [slash, fireball, heal, roar, charge],
};
const mage: PartyMember = { id: 'mage', name: '魔法使い', stats, skills: [fireball, heal] };

const dummy: Enemy = {
  id: 'dummy', name: '木人',
  stats: { ...stats, maxHp: 2000, def: 60, mdf: 40, spd: 5 },
  skills: [slash, roar, charge],
  resist: { fire: 1.5 },
  pattern: [{ skillId: 'slash' }],
};

describe('performAction - ダメージ', () => {
  it('物理攻撃で敵の HP を削る', () => {
    const state = createBattleState([hero], dummy);
    const { state: after, events } = performAction(state, 'hero', slash);
    // ATK120 威力100 vs DEF60 -> 75
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 75);
    expect(events).toContainEqual({ t: 'damage', targetId: 'dummy', amount: 75, hpAfter: 1925 });
  });

  it('敵の属性弱点を反映する', () => {
    const state = createBattleState([mage], dummy);
    const { state: after } = performAction(state, 'mage', fireball);
    // MAT100 威力150 = 150 -> 150 * 100/140 = 107.1 -> * 1.5 = 160.7 -> 160
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 160);
  });

  it('MP を消費してクールダウンを立てる', () => {
    const state = createBattleState([mage], dummy);
    const { state: after } = performAction(state, 'mage', fireball);
    const actor = findCombatant(after, 'mage');
    expect(actor.mp).toBe(80 - 12);
    expect(actor.cooldowns['fireball']).toBe(2);
  });

  it('倒したら down を記録する', () => {
    const weak: Enemy = { ...dummy, stats: { ...dummy.stats, maxHp: 10 } };
    const state = createBattleState([hero], weak);
    const { state: after, events } = performAction(state, 'hero', slash);
    expect(findCombatant(after, 'dummy').hp).toBe(0);
    expect(events).toContainEqual({ t: 'down', actorId: 'dummy' });
  });
});

describe('performAction - 回復と効果', () => {
  it('最も HP割合の低い味方を回復する', () => {
    const base = createBattleState([hero, mage], dummy);
    const wounded = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'mage' ? { ...c, hp: 100 } : c)),
    };
    const { state: after } = performAction(wounded, 'hero', heal);
    // MAT100 の 120% = 120 回復
    expect(findCombatant(after, 'mage').hp).toBe(220);
    expect(findCombatant(after, 'hero').hp).toBe(500);
  });

  it('回復は最大 HP を超えない', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', heal);
    expect(findCombatant(after, 'hero').hp).toBe(500);
  });

  it('相手全体にデバフをかける', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', roar);
    expect(findCombatant(after, 'dummy').effects).toHaveLength(1);
    expect(findCombatant(after, 'hero').effects).toHaveLength(0);
  });

  it('自分に効果をかける（溜め）', () => {
    const state = createBattleState([hero], dummy);
    const { state: after } = performAction(state, 'hero', charge);
    expect(findCombatant(after, 'hero').effects).toHaveLength(1);
  });

  it('溜め中の相手には増えたダメージが入る', () => {
    const state = createBattleState([hero, mage], dummy);
    const charged = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'dummy'
          ? { ...c, effects: [{ effect: { kind: 'damageTaken' as const, rate: 0.5, turns: 1 }, remaining: 1 }] }
          : c,
      ),
    };
    const { state: after } = performAction(charged, 'hero', slash);
    // 75 * 1.5 = 112.5 -> 112
    expect(findCombatant(after, 'dummy').hp).toBe(2000 - 112);
  });

  it('元の状態を書き換えない', () => {
    const state = createBattleState([hero], dummy);
    performAction(state, 'hero', slash);
    expect(findCombatant(state, 'dummy').hp).toBe(2000);
  });
});

describe('canUse', () => {
  it('MP が足りていてクールダウンも無ければ ok', () => {
    const state = createBattleState([mage], dummy);
    expect(canUse(findCombatant(state, 'mage'), fireball)).toBe('ok');
  });

  it('MP が足りなければ noMp', () => {
    const state = createBattleState([mage], dummy);
    const drained = { ...findCombatant(state, 'mage'), mp: 0 };
    expect(canUse(drained, fireball)).toBe('noMp');
  });

  it('クールダウン中なら cooldown', () => {
    const state = createBattleState([mage], dummy);
    const cooling = { ...findCombatant(state, 'mage'), cooldowns: { fireball: 1 } };
    expect(canUse(cooling, fireball)).toBe('cooldown');
  });
});
```

- [ ] **Step 3: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/action.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/action.js"`

- [ ] **Step 4: 実装を書く**

`packages/core/src/battle/action.ts`:

```ts
import { computeDamage } from './damage.js';
import { applyEffect, damageTakenRate, effectiveStat } from './effects.js';
import { isAlive } from './order.js';
import { findCombatant, updateCombatant } from './state.js';
import type { BattleState, Combatant } from './state.js';
import type { Skill } from './skill.js';
import type { Element } from './types.js';
import type { BattleEvent } from './log.js';

export type ActionResult = { state: BattleState; events: BattleEvent[] };

export function canUse(actor: Combatant, skill: Skill): 'ok' | 'noMp' | 'cooldown' {
  if ((actor.cooldowns[skill.id] ?? 0) > 0) return 'cooldown';
  if (actor.mp < skill.mpCost) return 'noMp';
  return 'ok';
}

/**
 * 技を1回使う。MP とクールダウンは呼び出し側で canUse により確認済みとする。
 * 状態は書き換えず、新しい state を返す。
 */
export function performAction(state: BattleState, actorId: string, skill: Skill): ActionResult {
  const actor = findCombatant(state, actorId);
  const events: BattleEvent[] = [{ t: 'act', actorId, skillId: skill.id }];

  let next = updateCombatant(state, actorId, (combatant) => ({
    ...combatant,
    mp: combatant.mp - skill.mpCost,
    cooldowns: { ...combatant.cooldowns, [skill.id]: skill.cooldown },
  }));

  const attackerAtk = effectiveStat(actor.base, 'atk', actor.effects);
  const attackerMat = effectiveStat(actor.base, 'mat', actor.effects);

  for (const target of resolveTargets(next, actor, skill)) {
    if (skill.damage) {
      const current = findCombatant(next, target.id);
      const amount = computeDamage({
        atk: attackerAtk,
        mat: attackerMat,
        def: effectiveStat(current.base, 'def', current.effects),
        mdf: effectiveStat(current.base, 'mdf', current.effects),
        targetMaxHp: current.base.maxHp,
        spec: skill.damage,
        elementRate: elementRateFor(next, current, skill.element),
        damageTakenRate: damageTakenRate(current.effects),
      });
      const hpAfter = Math.max(0, current.hp - amount);
      next = updateCombatant(next, current.id, (combatant) => ({ ...combatant, hp: hpAfter }));
      events.push({ t: 'damage', targetId: current.id, amount, hpAfter });
      if (hpAfter === 0) events.push({ t: 'down', actorId: current.id });
    }

    if (skill.heal !== undefined) {
      const current = findCombatant(next, target.id);
      const raw = Math.max(1, Math.floor((attackerMat * skill.heal) / 100));
      const hpAfter = Math.min(current.base.maxHp, current.hp + raw);
      next = updateCombatant(next, current.id, (combatant) => ({ ...combatant, hp: hpAfter }));
      events.push({ t: 'heal', targetId: current.id, amount: hpAfter - current.hp, hpAfter });
    }

    for (const entry of skill.effects ?? []) {
      if (entry.to !== 'target') continue;
      next = updateCombatant(next, target.id, (combatant) => ({
        ...combatant,
        effects: applyEffect(combatant.effects, entry.effect),
      }));
      events.push({ t: 'effect', targetId: target.id, effect: entry.effect });
    }
  }

  for (const entry of skill.effects ?? []) {
    if (entry.to !== 'self') continue;
    next = updateCombatant(next, actorId, (combatant) => ({
      ...combatant,
      effects: applyEffect(combatant.effects, entry.effect),
    }));
    events.push({ t: 'effect', targetId: actorId, effect: entry.effect });
  }

  return { state: next, events };
}

function resolveTargets(state: BattleState, actor: Combatant, skill: Skill): Combatant[] {
  const alive = state.combatants.filter(isAlive);
  const foes = alive.filter((combatant) => combatant.side !== actor.side);
  const mates = alive.filter((combatant) => combatant.side === actor.side);

  switch (skill.target) {
    case 'enemy':
      return pickLowestHp(foes);
    case 'allEnemies':
      return foes;
    case 'lowestHpAlly':
      return pickLowestHp(mates);
    case 'allAllies':
      return mates;
    case 'self':
      return [actor];
  }
}

/** HP割合が最も低い1体。同率なら ID 昇順。誰もいなければ空。 */
function pickLowestHp(candidates: Combatant[]): Combatant[] {
  if (candidates.length === 0) return [];
  const best = candidates.reduce((lowest, candidate) => {
    const a = hpRate(candidate);
    const b = hpRate(lowest);
    if (a < b) return candidate;
    if (a > b) return lowest;
    return candidate.id < lowest.id ? candidate : lowest;
  });
  return [best];
}

function hpRate(combatant: Combatant): number {
  return combatant.hp / combatant.base.maxHp;
}

function elementRateFor(state: BattleState, target: Combatant, element: Element): number {
  if (target.side !== 'enemy') return 1;
  return state.enemyDef.resist?.[element] ?? 1;
}
```

- [ ] **Step 5: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全51件）

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/battle/log.ts packages/core/src/battle/action.ts packages/core/tests/battle/action.test.ts
git commit -m "feat: 1回の行動の解決とダメージ・回復・効果の適用

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 敵の行動表と激昂

**Files:**
- Create: `packages/core/src/battle/enemyTurn.ts`
- Test: `packages/core/tests/battle/enemyTurn.test.ts`

**Interfaces:**
- Consumes: `BattleState`/`findCombatant`（Task 4）、`Skill`（Task 4）、`BattleEvent`（Task 6）
- Produces: `nextEnemyAction(state: BattleState): Skill | null`, `checkEnrage(state: BattleState): { state: BattleState; events: BattleEvent[] }`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/battle/enemyTurn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextEnemyAction, checkEnrage } from '../../src/battle/enemyTurn.js';
import { createBattleState } from '../../src/battle/state.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  maxHp: 500, maxMp: 80, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const breath: Skill = {
  id: 'breath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies', damage: { kind: 'magical', power: 180 },
};
const roar: Skill = {
  id: 'roar', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};
const rampage: Skill = {
  id: 'rampage', name: '狂乱', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies', damage: { kind: 'physical', power: 200 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [] };

const dragon: Enemy = {
  id: 'dragon', name: '竜',
  stats: { ...stats, maxHp: 1000 },
  skills: [breath, roar, rampage],
  pattern: [{ skillId: 'breath' }, { skillId: 'roar' }],
  enrage: { hpRate: 0.5, pattern: [{ skillId: 'rampage' }] },
};

describe('nextEnemyAction', () => {
  it('ターン数に応じて行動表を上から順に使う', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 1 })?.id).toBe('breath');
    expect(nextEnemyAction({ ...state, turn: 2 })?.id).toBe('roar');
  });

  it('行動表を使い切ったら先頭に戻る', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 3 })?.id).toBe('breath');
    expect(nextEnemyAction({ ...state, turn: 4 })?.id).toBe('roar');
  });

  it('激昂したら別の行動表に切り替わる', () => {
    const state = createBattleState([hero], dragon);
    expect(nextEnemyAction({ ...state, turn: 1, enraged: true })?.id).toBe('rampage');
  });

  it('行動表が空なら何もしない', () => {
    const state = createBattleState([hero], { ...dragon, pattern: [] });
    expect(nextEnemyAction(state)).toBeNull();
  });
});

describe('checkEnrage', () => {
  it('HP がしきい値を上回っていれば何も起きない', () => {
    const state = createBattleState([hero], dragon);
    const result = checkEnrage(state);
    expect(result.state.enraged).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('HP がしきい値以下になったら激昂する', () => {
    const base = createBattleState([hero], dragon);
    const hurt = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 500 } : c)),
    };
    const result = checkEnrage(hurt);
    expect(result.state.enraged).toBe(true);
    expect(result.events).toEqual([{ t: 'enrage', actorId: 'dragon' }]);
  });

  it('二度は激昂しない', () => {
    const base = createBattleState([hero], dragon);
    const already = {
      ...base,
      enraged: true,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 100 } : c)),
    };
    expect(checkEnrage(already).events).toHaveLength(0);
  });

  it('激昂を持たない敵では何も起きない', () => {
    const plain: Enemy = { id: 'dragon', name: '竜', stats: dragon.stats, skills: [breath], pattern: [{ skillId: 'breath' }] };
    const base = createBattleState([hero], plain);
    const hurt = {
      ...base,
      combatants: base.combatants.map((c) => (c.id === 'dragon' ? { ...c, hp: 1 } : c)),
    };
    expect(checkEnrage(hurt).state.enraged).toBe(false);
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/enemyTurn.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/enemyTurn.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/battle/enemyTurn.ts`:

```ts
import { findCombatant } from './state.js';
import type { BattleState } from './state.js';
import type { Skill } from './skill.js';
import type { BattleEvent } from './log.js';

/**
 * その敵がこのターンに使う技を返す。
 * 行動表はターン数で循環するだけなので、プレイヤーは何ターン目に何が来るか読める。
 */
export function nextEnemyAction(state: BattleState): Skill | null {
  const table =
    state.enraged && state.enemyDef.enrage ? state.enemyDef.enrage.pattern : state.enemyDef.pattern;
  if (table.length === 0) return null;

  const entry = table[(state.turn - 1) % table.length];
  return state.enemyDef.skills.find((skill) => skill.id === entry.skillId) ?? null;
}

/** HP がしきい値以下になっていたら激昂させる。すでに激昂済みなら何もしない。 */
export function checkEnrage(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  const config = state.enemyDef.enrage;
  if (!config || state.enraged) return { state, events: [] };

  const foe = findCombatant(state, state.enemyDef.id);
  if (foe.hp > foe.base.maxHp * config.hpRate) return { state, events: [] };

  return { state: { ...state, enraged: true }, events: [{ t: 'enrage', actorId: foe.id }] };
}
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全59件）

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/battle/enemyTurn.ts packages/core/tests/battle/enemyTurn.test.ts
git commit -m "feat: 敵の行動表の循環と激昂判定

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 戦闘ループ本体

**Files:**
- Create: `packages/core/src/battle/simulate.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/tests/battle/simulate.test.ts`

**Interfaces:**
- Consumes: これまでの全モジュール
- Produces: `DEFAULT_MAX_TURNS`, `BattlePlan`, `SimulateOptions`, `simulate(party, enemy, plan, options?): BattleLog`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/tests/battle/simulate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import type { PartyMember } from '../../src/battle/state.js';
import type { Enemy } from '../../src/battle/enemy.js';
import type { Skill } from '../../src/battle/skill.js';
import type { StatBlock } from '../../src/battle/types.js';

const stats: StatBlock = {
  // 敵の噛みつきは毎ターン75。8ターン耐えて timeout に到達させるため余裕を持たせる
  maxHp: 5000, maxMp: 30, atk: 120, def: 60, mat: 100, mdf: 40, spd: 20,
};

const slash: Skill = {
  id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 },
};
const heavy: Skill = {
  id: 'heavy', name: '渾身の一撃', mpCost: 20, cooldown: 3,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 300 },
};
const bite: Skill = {
  id: 'bite', name: '噛みつく', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy', damage: { kind: 'physical', power: 100 },
};

const hero: PartyMember = { id: 'hero', name: '主人公', stats, skills: [slash, heavy] };

function makeFoe(maxHp: number, spd = 5): Enemy {
  return {
    id: 'foe', name: '的',
    stats: { ...stats, maxHp, spd },
    skills: [bite],
    pattern: [{ skillId: 'bite' }],
  };
}

describe('simulate - 決着', () => {
  it('敵を倒しきれば win', () => {
    const plan: BattlePlan = { hero: ['slash', 'slash'] };
    const log = simulate([hero], makeFoe(150), plan);
    expect(log.result).toBe('win');
    expect(log.turns).toBe(2);
  });

  it('倒しきれずターン上限に達したら timeout', () => {
    const plan: BattlePlan = { hero: ['slash'] };
    const log = simulate([hero], makeFoe(99999), plan);
    expect(log.result).toBe('timeout');
    expect(log.turns).toBe(8);
  });

  it('味方が全滅したら lose', () => {
    const deadly: Enemy = {
      ...makeFoe(99999, 99),
      skills: [{ ...bite, damage: { kind: 'fixed', amount: 9999 } }],
    };
    const log = simulate([hero], deadly, { hero: ['slash'] });
    expect(log.result).toBe('lose');
  });

  it('最終イベントは end で、結果とターン数を持つ', () => {
    const log = simulate([hero], makeFoe(150), { hero: ['slash', 'slash'] });
    expect(log.events[log.events.length - 1]).toEqual({ t: 'end', result: 'win', turns: 2 });
  });
});

describe('simulate - プラン', () => {
  it('並べた技を1ターン目から順に使う', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['heavy', 'slash'] });
    const acts = log.events.filter((e) => e.t === 'act' && e.actorId === 'hero');
    expect(acts[0]).toEqual({ t: 'act', actorId: 'hero', skillId: 'heavy' });
    expect(acts[1]).toEqual({ t: 'act', actorId: 'hero', skillId: 'slash' });
  });

  it('プランが尽きたターンは何もしない', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['slash'] });
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'noAction' });
  });

  it('MP が足りなければ空振りする', () => {
    const log = simulate([hero], makeFoe(99999), { hero: ['heavy', null, null, null, 'heavy'] });
    // MP30 で 20 の技を1回使うと 10 しか残らず、2回目は撃てない
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'noMp' });
  });

  it('クールダウン中の技は空振りする', () => {
    const rich: PartyMember = { ...hero, stats: { ...stats, maxMp: 200 } };
    const log = simulate([rich], makeFoe(99999), { hero: ['heavy', 'heavy'] });
    expect(log.events).toContainEqual({ t: 'skip', actorId: 'hero', reason: 'cooldown' });
  });

  it('クールダウンが明けたら再び使える', () => {
    const rich: PartyMember = { ...hero, stats: { ...stats, maxMp: 200 } };
    const log = simulate([rich], makeFoe(99999), { hero: ['heavy', null, null, 'heavy'] });
    const acts = log.events.filter((e) => e.t === 'act' && e.actorId === 'hero');
    expect(acts).toHaveLength(2);
  });
});

describe('simulate - 決定論', () => {
  it('同じ入力からは同じログが出る', () => {
    const plan: BattlePlan = { hero: ['slash', 'heavy', 'slash'] };
    const a = simulate([hero], makeFoe(400), plan);
    const b = simulate([hero], makeFoe(400), plan);
    expect(a).toEqual(b);
  });

  it('速い側から順に行動する', () => {
    const log = simulate([hero], makeFoe(99999, 99), { hero: ['slash'] });
    const firstAct = log.events.find((e) => e.t === 'act');
    expect(firstAct).toEqual({ t: 'act', actorId: 'foe', skillId: 'bite' });
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `pnpm --filter @mq/core test tests/battle/simulate.test.ts`
Expected: FAIL。`Failed to resolve import "../../src/battle/simulate.js"`

- [ ] **Step 3: 実装を書く**

`packages/core/src/battle/simulate.ts`:

```ts
import { canUse, performAction } from './action.js';
import { isStunned, tickEffects } from './effects.js';
import { checkEnrage, nextEnemyAction } from './enemyTurn.js';
import { isAlive, turnOrder } from './order.js';
import { createBattleState, findCombatant, updateCombatant } from './state.js';
import type { BattleState, Combatant, PartyMember } from './state.js';
import type { Enemy } from './enemy.js';
import type { Skill } from './skill.js';
import type { BattleEvent, BattleLog, BattleResult } from './log.js';

export const DEFAULT_MAX_TURNS = 8;

/** キャラID -> ターンごとの技ID。null は「何もしない」。 */
export type BattlePlan = Record<string, (string | null)[]>;

export type SimulateOptions = { maxTurns?: number };

/**
 * 戦闘をまるごと解決する。乱数を使わないので、同じ入力からは必ず同じログが出る。
 * サーバがこの関数の結果を正とし、フロントは返ってきたログを再生するだけでよい。
 */
export function simulate(
  party: PartyMember[],
  enemy: Enemy,
  plan: BattlePlan,
  options: SimulateOptions = {},
): BattleLog {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  let state = createBattleState(party, enemy);
  const events: BattleEvent[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    state = { ...state, turn };
    events.push({ t: 'turnStart', turn });

    for (const scheduled of turnOrder(state.combatants)) {
      const actor = findCombatant(state, scheduled.id);
      if (!isAlive(actor)) continue;

      if (isStunned(actor.effects)) {
        events.push({ t: 'skip', actorId: actor.id, reason: 'stunned' });
        continue;
      }

      const skill =
        actor.side === 'enemy' ? nextEnemyAction(state) : skillFromPlan(actor, plan, turn);

      if (!skill) {
        events.push({ t: 'skip', actorId: actor.id, reason: 'noAction' });
        continue;
      }

      const usable = canUse(actor, skill);
      if (usable !== 'ok') {
        events.push({ t: 'skip', actorId: actor.id, reason: usable });
        continue;
      }

      const acted = performAction(state, actor.id, skill);
      state = acted.state;
      events.push(...acted.events);

      const enraged = checkEnrage(state);
      state = enraged.state;
      events.push(...enraged.events);

      const decided = decide(state);
      if (decided) return finish(decided, turn, events);
    }

    const ticked = tickAll(state);
    state = ticked.state;
    events.push(...ticked.events);
  }

  return finish('timeout', maxTurns, events);
}

function skillFromPlan(actor: Combatant, plan: BattlePlan, turn: number): Skill | null {
  const skillId = plan[actor.id]?.[turn - 1] ?? null;
  if (skillId === null) return null;
  return actor.skills.find((skill) => skill.id === skillId) ?? null;
}

function decide(state: BattleState): BattleResult | null {
  if (!isAlive(findCombatant(state, state.enemyDef.id))) return 'win';
  if (!state.combatants.some((c) => c.side === 'ally' && isAlive(c))) return 'lose';
  return null;
}

/** ターン終わりに、効果の残りターンとクールダウンを1ずつ減らす。 */
function tickAll(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  let next = state;
  const events: BattleEvent[] = [];

  for (const combatant of state.combatants) {
    const { remaining, expired } = tickEffects(combatant.effects);
    const cooldowns = Object.fromEntries(
      Object.entries(combatant.cooldowns).map(([id, turns]) => [id, Math.max(0, turns - 1)]),
    );
    next = updateCombatant(next, combatant.id, (target) => ({ ...target, effects: remaining, cooldowns }));
    for (const active of expired) {
      events.push({ t: 'expire', targetId: combatant.id, effect: active.effect });
    }
  }

  return { state: next, events };
}

function finish(result: BattleResult, turns: number, events: BattleEvent[]): BattleLog {
  return { result, turns, events: [...events, { t: 'end', result, turns }] };
}
```

- [ ] **Step 4: 公開APIをまとめる**

`packages/core/src/index.ts`:

```ts
export { simulate, DEFAULT_MAX_TURNS } from './battle/simulate.js';
export type { BattlePlan, SimulateOptions } from './battle/simulate.js';

export { computeDamage } from './battle/damage.js';
export { createBattleState, findCombatant, updateCombatant } from './battle/state.js';
export { turnOrder, isAlive } from './battle/order.js';
export { canUse, performAction } from './battle/action.js';
export { nextEnemyAction, checkEnrage } from './battle/enemyTurn.js';
export {
  effectiveStat,
  damageTakenRate,
  isStunned,
  applyEffect,
  tickEffects,
} from './battle/effects.js';

export type { StatBlock, Element, DamageSpec, DamageInput } from './battle/types.js';
export type { StatKey, Effect, ActiveEffect } from './battle/effects.js';
export type { Skill, SkillTarget } from './battle/skill.js';
export type { Enemy, EnemyPatternEntry } from './battle/enemy.js';
export type { Side, Combatant, PartyMember, BattleState } from './battle/state.js';
export type { BattleResult, SkipReason, BattleEvent, BattleLog } from './battle/log.js';
```

- [ ] **Step 5: テストと型チェックを走らせる**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全70件）

Run: `pnpm --filter @mq/core typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add packages/core/src/battle/simulate.ts packages/core/src/index.ts packages/core/tests/battle/simulate.test.ts
git commit -m "feat: 戦闘ループ本体と公開API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: マスタデータとボス戦の回帰テスト

**Files:**
- Create: `packages/core/src/data/skills.ts`
- Create: `packages/core/src/data/enemies.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/battle/boss.test.ts`

**Interfaces:**
- Consumes: `Skill`（Task 4）、`Enemy`（Task 4）、`simulate`/`BattlePlan`（Task 8）
- Produces: `SKILLS: Record<string, Skill>`, `ENEMIES: Record<string, Enemy>`

マスタデータは D1 に入れず TypeScript の定数として持つ。型チェックが効き、バランス調整が git の差分として読めるため。

- [ ] **Step 1: 技のマスタを書く**

`packages/core/src/data/skills.ts`:

```ts
import type { Skill } from '../battle/skill.js';

/** 技のマスタ。バランス調整はここの数値をいじる。 */
export const SKILLS = {
  slash: {
    id: 'slash', name: '斬りつける', mpCost: 0, cooldown: 0,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 100 },
  },
  heavyBlow: {
    id: 'heavyBlow', name: '渾身の一撃', mpCost: 14, cooldown: 3,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 320 },
  },
  armorBreak: {
    id: 'armorBreak', name: '鎧砕き', mpCost: 10, cooldown: 4,
    element: 'none', target: 'enemy',
    damage: { kind: 'physical', power: 80, pierce: 0.5 },
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'def', rate: -0.4, turns: 3 } }],
  },
  iceLance: {
    id: 'iceLance', name: '氷の槍', mpCost: 12, cooldown: 0,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 180 },
  },
  blizzard: {
    id: 'blizzard', name: '氷嵐', mpCost: 24, cooldown: 3,
    element: 'ice', target: 'enemy',
    damage: { kind: 'magical', power: 380 },
  },
  holyLight: {
    id: 'holyLight', name: '癒やしの光', mpCost: 9, cooldown: 0,
    element: 'holy', target: 'lowestHpAlly',
    heal: 160,
  },
  guardChant: {
    id: 'guardChant', name: '守りの詠唱', mpCost: 8, cooldown: 4,
    element: 'holy', target: 'allAllies',
    effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'mdf', rate: 0.5, turns: 3 } }],
  },
  poisonDagger: {
    id: 'poisonDagger', name: '毒短剣', mpCost: 6, cooldown: 2,
    element: 'dark', target: 'enemy',
    damage: { kind: 'fixed', amount: 120 },
  },
} as const satisfies Record<string, Skill>;
```

- [ ] **Step 2: 敵のマスタを書く**

`packages/core/src/data/enemies.ts`:

```ts
import type { Enemy } from '../battle/enemy.js';
import type { Skill } from '../battle/skill.js';

const dragonBreath: Skill = {
  id: 'dragonBreath', name: '火炎の息', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 180 },
};

const intimidate: Skill = {
  id: 'intimidate', name: '威嚇', mpCost: 0, cooldown: 0,
  element: 'none', target: 'allEnemies',
  effects: [{ to: 'target', effect: { kind: 'statMod', stat: 'atk', rate: -0.3, turns: 3 } }],
};

const charge: Skill = {
  id: 'charge', name: '溜め', mpCost: 0, cooldown: 0,
  element: 'none', target: 'self',
  effects: [{ to: 'self', effect: { kind: 'damageTaken', rate: 0.5, turns: 1 } }],
};

const blazingBurst: Skill = {
  id: 'blazingBurst', name: '灼熱爆発', mpCost: 0, cooldown: 0,
  element: 'fire', target: 'allEnemies',
  damage: { kind: 'magical', power: 900 },
};

const frenzy: Skill = {
  id: 'frenzy', name: '狂乱の爪', mpCost: 0, cooldown: 0,
  element: 'none', target: 'enemy',
  damage: { kind: 'physical', power: 260 },
};

/**
 * 第1章のボス。行動表はプレイヤーに全部見せる前提で組んである。
 * 3ターン目の「溜め」に火力を集中させ、4ターン目の灼熱爆発の前に削り切るのが想定解。
 */
export const BALGOS: Enemy = {
  id: 'balgos',
  name: '炎竜バルゴス',
  stats: { maxHp: 4800, maxMp: 999, atk: 140, def: 60, mat: 130, mdf: 40, spd: 12 },
  skills: [dragonBreath, intimidate, charge, blazingBurst, frenzy],
  resist: { fire: 0.5, ice: 1.5 },
  pattern: [
    { skillId: 'dragonBreath' },
    { skillId: 'intimidate' },
    { skillId: 'charge' },
    { skillId: 'blazingBurst' },
  ],
  enrage: {
    hpRate: 0.5,
    pattern: [{ skillId: 'frenzy' }, { skillId: 'dragonBreath' }],
  },
};

export const ENEMIES = { balgos: BALGOS } as const satisfies Record<string, Enemy>;
```

- [ ] **Step 3: 公開APIに追加する**

`packages/core/src/index.ts` の末尾に追記:

```ts
export { SKILLS } from './data/skills.js';
export { ENEMIES, BALGOS } from './data/enemies.js';
```

- [ ] **Step 4: ボス戦の回帰テストを書く**

このテストは「意図した攻略法で勝てて、雑な並びでは勝てない」ことを固定する。
バランス調整で意図せずどちらかが崩れたら、ここが落ちる。

`packages/core/tests/battle/boss.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import type { BattlePlan } from '../../src/battle/simulate.js';
import { SKILLS } from '../../src/data/skills.js';
import { BALGOS } from '../../src/data/enemies.js';
import type { PartyMember } from '../../src/battle/state.js';

const warrior: PartyMember = {
  id: 'warrior', name: '戦士',
  stats: { maxHp: 900, maxMp: 60, atk: 150, def: 80, mat: 40, mdf: 40, spd: 22 },
  skills: [SKILLS.slash, SKILLS.heavyBlow, SKILLS.armorBreak],
};

const mage: PartyMember = {
  id: 'mage', name: '魔法使い',
  stats: { maxHp: 620, maxMp: 110, atk: 50, def: 40, mat: 165, mdf: 70, spd: 18 },
  skills: [SKILLS.iceLance, SKILLS.blizzard],
};

const priest: PartyMember = {
  id: 'priest', name: '僧侶',
  stats: { maxHp: 700, maxMp: 100, atk: 60, def: 55, mat: 130, mdf: 85, spd: 15 },
  skills: [SKILLS.holyLight, SKILLS.guardChant],
};

const thief: PartyMember = {
  id: 'thief', name: '盗賊',
  stats: { maxHp: 660, maxMp: 70, atk: 110, def: 50, mat: 60, mdf: 50, spd: 30 },
  skills: [SKILLS.slash, SKILLS.poisonDagger],
};

const party = [warrior, mage, priest, thief];

describe('炎竜バルゴス', () => {
  it('溜めターンに火力を集中させる並びなら勝てる', () => {
    const plan: BattlePlan = {
      warrior: ['armorBreak', 'slash', 'heavyBlow', 'slash', 'heavyBlow', 'slash', 'slash', 'slash'],
      mage: ['iceLance', 'iceLance', 'blizzard', 'iceLance', 'blizzard', 'iceLance', 'iceLance', 'iceLance'],
      priest: ['guardChant', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight'],
      thief: ['poisonDagger', 'slash', 'poisonDagger', 'slash', 'poisonDagger', 'slash', 'slash', 'slash'],
    };
    expect(simulate(party, BALGOS, plan).result).toBe('win');
  });

  it('通常攻撃を並べただけでは勝てない', () => {
    const lazy = ['slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash'];
    const plan: BattlePlan = {
      warrior: lazy,
      mage: ['iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance', 'iceLance'],
      priest: lazy,
      thief: lazy,
    };
    expect(simulate(party, BALGOS, plan).result).not.toBe('win');
  });

  it('半分まで削ると激昂する', () => {
    const plan: BattlePlan = {
      warrior: ['armorBreak', 'heavyBlow', 'slash', 'heavyBlow', 'slash', 'slash', 'slash', 'slash'],
      mage: ['blizzard', 'iceLance', 'iceLance', 'blizzard', 'iceLance', 'iceLance', 'iceLance', 'iceLance'],
      priest: ['holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight', 'holyLight'],
      thief: ['poisonDagger', 'slash', 'poisonDagger', 'slash', 'slash', 'slash', 'slash', 'slash'],
    };
    const log = simulate(party, BALGOS, plan);
    expect(log.events.some((e) => e.t === 'enrage')).toBe(true);
  });

  it('同じ入力からは同じ結果が出る', () => {
    const plan: BattlePlan = { warrior: ['slash'], mage: ['iceLance'], priest: ['holyLight'], thief: ['slash'] };
    expect(simulate(party, BALGOS, plan)).toEqual(simulate(party, BALGOS, plan));
  });
});
```

- [ ] **Step 5: テストを走らせ、落ちたら敵の数値を調整する**

Run: `pnpm --filter @mq/core test tests/battle/boss.test.ts`
Expected: PASS（4件）

**落ちた場合は、テストではなく `packages/core/src/data/enemies.ts` の数値を調整する。**
このテストは「バランスがこうあってほしい」という宣言であり、実装の記述ではない。

- 想定解が勝てない → `BALGOS.stats.maxHp` を 200 ずつ下げる、または `def` を 5 ずつ下げる
- 雑な並びでも勝ててしまう → `maxHp` を 200 ずつ上げる、または `blazingBurst` の威力を上げる
- 激昂しない → 想定解の火力が足りていない。まず1つ目のテストを通すこと

調整のたびに全テストを走らせ、他が壊れていないことを確認する。

- [ ] **Step 6: 全テストと型チェックを走らせる**

Run: `pnpm --filter @mq/core test`
Expected: PASS（全74件）

Run: `pnpm --filter @mq/core typecheck`
Expected: エラーなし

- [ ] **Step 7: 乱数を使っていないことを確認する**

Run: `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src`
Expected: 出力なし

- [ ] **Step 8: コミット**

```bash
git add packages/core/src/data packages/core/src/index.ts packages/core/tests/battle/boss.test.ts
git commit -m "feat: 技・敵のマスタと炎竜バルゴス戦の回帰テスト

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の定義

段階1が終わったと言えるのは、次がすべて満たされたときだけ。

- [ ] `pnpm --filter @mq/core test` が全件 PASS
- [ ] `pnpm --filter @mq/core typecheck` がエラーなし
- [ ] `packages/core/package.json` の `dependencies` が空（実行時依存ゼロ）
- [ ] `grep -rnE "Math\.random|Date\.now|crypto\." packages/core/src` が空
- [ ] 炎竜バルゴスに、想定解で勝てて雑な並びでは勝てない

## この計画に含まれないもの

仕様書の段階2以降。ここでは扱わない。

- 経験値・レベルアップ・職業・上級職（段階2 `core/progression`）
- イベント抽選・投票・締め処理（段階3 `core/events` と Worker）
- D1 スキーマ・認証・画面（段階4）
- 雇用市場の生成、ペットの入手
- 装備枠の上限チェック（アクティブ6枠・パッシブ2枠）。`PartyMember` は枠数を検証しない。
  枠の管理は育成の責務なので段階2で行う
