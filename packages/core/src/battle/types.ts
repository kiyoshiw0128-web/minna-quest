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
