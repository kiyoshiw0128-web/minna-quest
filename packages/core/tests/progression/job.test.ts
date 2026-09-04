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
