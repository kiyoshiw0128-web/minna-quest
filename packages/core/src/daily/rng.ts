/**
 * 決定論的な擬似乱数。
 *
 * 状態を持つジェネレータではなく、(seed, index) から値を引く純関数にしてある。
 * 同じ組は常に同じ値を返し、途中の任意の位置から引き直せる。
 * これにより「なぜこの選択肢が出たか」を後から誰でも再現できる。
 *
 * 標準の擬似乱数・現在時刻・暗号系の乱数APIはいずれも再現できないので使わない。
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
