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

/** 技の威力を決めうる能力。maxHp と maxMp は威力には使わない。 */
export type StatKey = 'atk' | 'def' | 'mat' | 'mdf' | 'spd';

/** 攻撃側の実効ステータス。バフ適用後の値。 */
export type AttackerStats = Readonly<Record<StatKey, number>>;

/** 技のダメージの決まり方。4タイプのいずれか。 */
export type DamageSpec =
  | { kind: 'physical'; power: number; pierce?: number; scale?: StatKey }
  | { kind: 'magical'; power: number; pierce?: number; scale?: StatKey }
  | { kind: 'fixed'; amount: number }
  | { kind: 'ratio'; percent: number; cap: number };

/** computeDamage への入力。ステータスは実効値（バフ適用後）を渡す。 */
export type DamageInput = {
  /** 攻撃側の全能力。どれを使うかは spec.scale が決める */
  attacker: AttackerStats;
  def: number;
  mdf: number;
  targetMaxHp: number;
  spec: DamageSpec;
  elementRate: number;
  damageTakenRate: number;
};
