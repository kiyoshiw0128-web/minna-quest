import { bearerToken, sha256Hex } from '../auth.js';
import { findPlayerByTokenHash, setPlayerEmail } from '../store.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type EmailBody = { email?: unknown };

/** 最低限の形式チェックのみ（設計書 §4）。厳しくすると正当なアドレスを弾く。届くかは送ってみるまで分からない。 */
function looksLikeEmail(value: string): boolean {
  return value.includes('@') && !/\s/.test(value);
}

/**
 * メールアドレスの登録・変更・削除（設計書 §4）。`{ email }` で登録・変更、
 * 空文字で削除。任意機能であり、参加の条件にはしない（設計書 §2.2）。
 *
 * `requirePlayer` を使わず自分でトークンを引いているのは、プレイヤーだけでなく
 * 平文のトークンそのものも要るため。players.token_hash は不可逆なので、
 * 後から「いまの合言葉」を復旧メールで送るには、それが有効だと分かる
 * このタイミング（Bearer認証を通った瞬間）でしか平文を控えられない
 * （apps/worker/src/auth.ts、migrations/0008_email_recovery.sql 参照）。
 *
 * `setPlayerEmail` は WHERE id = ? にBearer認証で確定した本人のIDだけを使う。
 * bodyにplayerIdを持たせて他人を指せるようにはしていないので、
 * このエンドポイントの形そのものが「他人のアドレスを変えられない」を保証する
 * （設計書 §8 テスト2）。
 */
export async function handleEmail(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return fail('unauthorized', 401);

  const player = await findPlayerByTokenHash(env.DB, await sha256Hex(token));
  if (player === null) return fail('unauthorized', 401);

  let body: EmailBody;
  try {
    body = (await request.json()) as EmailBody;
  } catch {
    return fail('invalid JSON body');
  }

  if (typeof body.email !== 'string') return fail('email is required (empty string to remove)');
  const email = body.email.trim();

  if (email !== '' && !looksLikeEmail(email)) return fail('invalid email');

  // 削除するときは、控えていた合言葉も一緒に消す。メールを登録していない
  // 間は、平文の合言葉をどこにも残さないため（設計書 §2.2・§8 テスト1）。
  await setPlayerEmail(env.DB, player.id, email === '' ? null : email, email === '' ? null : token);

  return ok({ registered: email !== '' });
}
