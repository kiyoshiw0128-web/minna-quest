import type { Env } from './env.js';

/**
 * メール送信の薄い層（設計書 §5）。Resend のHTTP APIを叩くだけにして、
 * 送信サービスの詳細をこのファイルの外に漏らさない。別サービスに乗り換える
 * ときは、このファイルだけ書き換えれば済む形にする。
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resendはドメイン認証済みのFromしか使えない。ユーザーがまだドメインを
// 認証していない段階なので、ここは仮の値にしてある。認証が済んだら
// 実際のドメインのアドレスに差し替えること（このファイル冒頭に書く理由は
// プロバイダ依存をmail.tsに閉じる、という設計書の方針に合わせるため）。
const FROM_ADDRESS = 'onboarding@resend.dev';

export type RecoveryMailParams = {
  readonly to: string;
  /** いまの合言葉そのもの（設計書 §2.1 — 作り直さず、いま使えているものを送る）。 */
  readonly token: string;
};

/**
 * 合言葉の再送メールを送る。
 *
 * キーが未設定の場合は送らずに戻る。ただし黙って戻ると「本当に登録されて
 * いないのか、キーが無いだけなのか」が運用側から一切分からなくなるため、
 * ログにだけはっきり残す（設計書 §5）。
 *
 * 送信の成否を呼び出し側（recover.ts）の応答には一切反映しない。
 * 反映してしまうと、登録の有無・送信の成否が外部から観測できるようになり、
 * §2.3 の「応答を変えない」が崩れる。失敗はログにだけ残す。
 */
export async function sendRecoveryMail(env: Env, params: RecoveryMailParams): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    console.log('RESEND_API_KEY が未設定のため、復旧メールを送信していません');
    return;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: params.to,
        subject: '日々譚 — 合言葉の再送',
        text: [
          'この冒険の合言葉をお送りします。',
          '',
          params.token,
          '',
          '「合言葉で戻る」の欄にこの文字列を貼ると、元の冒険に戻れます。',
          '心当たりが無い場合は、このメールを無視してください。',
        ].join('\n'),
      }),
    });
    if (!response.ok) {
      console.error(`復旧メールの送信に失敗しました: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error('復旧メールの送信中に例外が発生しました', error);
  }
}
