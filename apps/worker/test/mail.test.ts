import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendRecoveryMail } from '../src/mail.js';
import type { Env } from '../src/env.js';

// DB・ASSETSはmail.tsが触らないので、テストではダミーで足りる。
const BASE_ENV = { DB: {} as Env['DB'], ASSETS: {} as Env['ASSETS'] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendRecoveryMail（設計書 §5・§8 テスト5・7）', () => {
  it('APIキーが無ければ送らずにログへ残す', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendRecoveryMail(BASE_ENV, { to: 'a@example.com', token: 'secret-token' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));
  });

  it('APIキーがあればResendを叩き、本文にいまの合言葉を含める（設計書 §8 テスト7）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    await sendRecoveryMail(
      { ...BASE_ENV, RESEND_API_KEY: 'test-key' },
      { to: 'a@example.com', token: 'secret-token-xyz' },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const sentBody = JSON.parse(init?.body as string) as { to: string; text: string };
    expect(sentBody.to).toBe('a@example.com');
    expect(sentBody.text).toContain('secret-token-xyz');
  });

  it('送信が失敗してもログに残すだけで、例外は投げない', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 500 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendRecoveryMail({ ...BASE_ENV, RESEND_API_KEY: 'test-key' }, { to: 'a@example.com', token: 't' }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('ネットワーク例外が起きても例外は投げない', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendRecoveryMail({ ...BASE_ENV, RESEND_API_KEY: 'test-key' }, { to: 'a@example.com', token: 't' }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
