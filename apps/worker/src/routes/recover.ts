import { randomToken, sha256Hex } from '../auth.js';
import { confirmRecovery, findPlayerByEmail, issueRecoveryCode } from '../store.js';
import { sendRecoveryMail } from '../mail.js';
import { fail, ok } from '../respond.js';
import type { Env } from '../env.js';

type RecoverBody = { email?: unknown };
type ConfirmBody = { code?: unknown };

/** 同じ相手には10分に1通まで（設計書 §2.4）。 */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/** 復旧コードの有効期限（設計書 §2.1）。 */
const RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;

/** 期限切れ・使用済み・存在しないコードのすべてに、同じ文言で断る（設計書 §2.1・§4）。 */
const INVALID_CODE_MESSAGE = 'invalid or expired code';

/**
 * 復旧コードの発行要求。**認証なし。**（設計書 §4）
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
 *
 * 発行するのは使い捨てのコードであって、合言葉そのものではない（設計書 §2.1）。
 * 要求しただけでは今の合言葉は一切変わらないので、アドレスを知っている
 * 誰かが繰り返し要求しても、本人が締め出されることはない。
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
  if (player !== null) {
    const now = Date.now();
    const last = player.recoverySentAt === null ? null : new Date(player.recoverySentAt).getTime();
    const withinCooldown = last !== null && now - last < RESEND_COOLDOWN_MS;

    // クールダウン中は何も書き換えない。ここで recovery_sent_at を更新すると、
    // アドレスを知っている誰かが要求を送り続けるだけで本人が永久に新しい
    // コードを受け取れなくなる（設計書 §2.1 と同じ「連投で締め出せてはいけない」
    // という考え方）。既に発行済みの、まだ有効な古いコードもそのまま生き続ける。
    if (!withinCooldown) {
      const code = randomToken();
      const codeHash = await sha256Hex(code);
      const expiresAt = new Date(now + RECOVERY_CODE_TTL_MS).toISOString();
      await issueRecoveryCode(env.DB, player.id, codeHash, expiresAt, new Date(now).toISOString());
      await sendRecoveryMail(env, { to: email, code });
    }
  }

  // 登録の有無・送信の成否に関わらず、ここに来た時点で同じ応答を返す（設計書 §2.3）。
  return ok({ requested: true });
}

/**
 * 復旧コードの確認。**認証なし。**（設計書 §4）
 *
 * 有効なコードなら新しい合言葉を発行して返す。使ったコードは
 * `confirmRecovery`（store.ts）が同じUPDATE文の中で即座に無効化するので、
 * 二度目の確認は「使用済み」として弾かれる（設計書 §8 テスト9）。
 *
 * 期限切れ・使用済み・存在しないコードは、すべて同じ `INVALID_CODE_MESSAGE`
 * で断る。`confirmRecovery` がこの3つを1つのWHERE句にまとめていて、
 * どれに当たったかという情報そのものをこの関数に渡してこないので、
 * ここで分岐しようにも分岐しようがない（設計書 §2.1「どれに当たったかを
 * 外から区別させない」）。
 */
export async function handleRecoverConfirm(request: Request, env: Env): Promise<Response> {
  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return fail('invalid JSON body');
  }

  if (typeof body.code !== 'string' || body.code.trim() === '') {
    return fail('code is required');
  }
  const code = body.code.trim();

  const codeHash = await sha256Hex(code);
  const newToken = randomToken();
  const newTokenHash = await sha256Hex(newToken);
  const now = new Date().toISOString();

  const confirmed = await confirmRecovery(env.DB, codeHash, newTokenHash, now);
  if (!confirmed) return fail(INVALID_CODE_MESSAGE);

  return ok({ token: newToken });
}
