import { findPlayerByTokenHash } from './store.js';
import type { PlayerRow } from './store.js';

/**
 * 128ビットの乱数を16進で返す。招待コードにもトークンにも使う。
 * この長さなら総当たりが現実的でないので、レート制限を置かずに守れる。
 */
export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 の16進表現。DBには平文ではなくこれを保存する。 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Authorization: Bearer <token> からトークンを取り出す。 */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header === null) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || token === undefined || token === '') return null;
  return token;
}

/** リクエストのトークンからプレイヤーを引く。認証できなければ null。 */
export async function requirePlayer(
  db: D1Database, request: Request,
): Promise<PlayerRow | null> {
  const token = bearerToken(request);
  if (token === null) return null;
  return findPlayerByTokenHash(db, await sha256Hex(token));
}
