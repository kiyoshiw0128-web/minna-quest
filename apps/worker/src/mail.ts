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
  /**
   * 使い捨ての復旧コード（設計書 §2.1）。合言葉そのものは送らない。
   * このコードを`/api/recover/confirm`に渡して初めて、新しい合言葉が発行される。
   */
  readonly code: string;
};

/**
 * 使い捨ての復旧コードのメールを送る。合言葉そのものは含まない（設計書 §2.1）。
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
        subject: '日々譚 — 合言葉の復旧コード',
        text: [
          '合言葉を取り戻すための、使い捨ての復旧コードをお送りします。',
          '',
          params.code,
          '',
          '「合言葉が分からない」の画面でこのコードを入力すると、新しい合言葉が発行されます。',
          'このコードは30分だけ有効で、一度使うと無効になります。',
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
