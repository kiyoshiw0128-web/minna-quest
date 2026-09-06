import { requirePlayer } from '../auth.js';
import { setPlayerEmail } from '../store.js';
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
 * `requirePlayer` だけで足りる。以前は合言葉そのもの（平文のBearerトークン）も
 * 一緒に控えていたが、それが生きた認証情報の平文控えという弱さそのものだった
 * ため2026-09-06に撤回した（設計書 §2.1、migrations/0009_recovery_codes.sql）。
 * いまはメールアドレスの登録有無と合言葉の状態は完全に独立している。
 *
 * `setPlayerEmail` は WHERE id = ? にBearer認証で確定した本人のIDだけを使う。
 * bodyにplayerIdを持たせて他人を指せるようにはしていないので、
 * このエンドポイントの形そのものが「他人のアドレスを変えられない」を保証する
 * （設計書 §8 テスト2）。
 */
export async function handleEmail(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(env.DB, request);
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

  await setPlayerEmail(env.DB, player.id, email === '' ? null : email);

  return ok({ registered: email !== '' });
}
