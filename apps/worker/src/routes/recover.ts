import { findPlayerByEmail, touchRecoverySentAt } from '../store.js';
import { sendRecoveryMail } from '../mail.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type RecoverBody = { email?: unknown };

/** 同じ相手には10分に1通まで（設計書 §2.4）。 */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * 合言葉の再送要求。**認証なし。**（設計書 §4）
 *
 * このエンドポイントの安全性は「外から見て何も分からないこと」そのもの。
 * 登録済みでも未登録でも、直前に送ったばかりでそうでなくても、送信に
 * 成功しても失敗しても、返す応答は常に同じにする（設計書 §2.3・§2.4・§5）。
 * ここに分岐を増やすときは、その分岐が応答の違いとして外部から
 * 観測できないかを必ず疑うこと。
 *
 * 形式チェックで弾く場合（JSONが壊れている・emailが無い）だけは400を返す。
 * これは「送ったどのメールアドレスか」に依存しない、リクエストそのものの
 * 不備なので、情報が漏れる分岐ではない。
 */
export async function handleRecover(request: Request, env: Env): Promise<Response> {
  let body: RecoverBody;
  try {
    body = (await request.json()) as RecoverBody;
  } catch {
    return fail('invalid JSON body');
  }

  if (typeof body.email !== 'string' || body.email.trim() === '') {
    return fail('email is required');
  }
  const email = body.email.trim();

  const player = await findPlayerByEmail(env.DB, email);
  if (player !== null && player.recoveryToken !== null) {
    const now = Date.now();
    const last = player.recoverySentAt === null ? null : new Date(player.recoverySentAt).getTime();
    const withinCooldown = last !== null && now - last < RESEND_COOLDOWN_MS;

    // クールダウン中は時刻を更新しない。ここで更新すると、アドレスを知っている
    // 誰かが要求を送り続けるだけで本人が永久に受け取れなくなる
    // （設計書 §2.1 と同じ「連投で締め出せてはいけない」という考え方）。
    if (!withinCooldown) {
      await touchRecoverySentAt(env.DB, player.id, new Date(now).toISOString());
      await sendRecoveryMail(env, { to: email, token: player.recoveryToken });
    }
  }

  // 登録の有無・送信の成否に関わらず、ここに来た時点で同じ応答を返す（設計書 §2.3）。
  return ok({ requested: true });
}
