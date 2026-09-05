import { describe, it, expect } from 'vitest';
import { PETS } from '../../src/data/pets.js';

describe('ペットマスタの健全性（段階6・設計書 §3）', () => {
  it('キーと id が一致している', () => {
    for (const [key, pet] of Object.entries(PETS)) {
      expect(pet.id).toBe(key);
    }
  });

  it('8匹いる', () => {
    expect(Object.keys(PETS)).toHaveLength(8);
  });

  it('名前・説明がどちらも空でない', () => {
    for (const pet of Object.values(PETS)) {
      expect(pet.name.length).toBeGreaterThan(0);
      expect(pet.description.length).toBeGreaterThan(0);
    }
  });

  it('turns は永続（Infinity）', () => {
    for (const pet of Object.values(PETS)) {
      expect(pet.effect.turns).toBe(Infinity);
    }
  });

  /**
   * 効果は控えめに、が設計書 §3 の要求。パッシブ2枠と足し合わさるため、
   * ここで大きな値を置くとペットの有無だけで難易度が割れてしまう。
   * stun や無効化のような「壊れる」種類の効果も禁止（§3「極端なものは置かない」）。
   */
  it('statMod は ±10〜20%、damageTaken は -20%〜0% の範囲に収まる（控えめ）', () => {
    for (const pet of Object.values(PETS)) {
      if (pet.effect.kind === 'statMod') {
        expect(Math.abs(pet.effect.rate)).toBeGreaterThanOrEqual(0.1);
        expect(Math.abs(pet.effect.rate)).toBeLessThanOrEqual(0.2);
      } else if (pet.effect.kind === 'damageTaken') {
        expect(pet.effect.rate).toBeLessThanOrEqual(0);
        expect(pet.effect.rate).toBeGreaterThanOrEqual(-0.2);
      } else {
        // stun 等、壊れうる効果は設計書 §3 で明示的に禁止されている。
        throw new Error('ペットに許可されていない効果種別（statMod / damageTaken 以外）');
      }
    }
  });
});
