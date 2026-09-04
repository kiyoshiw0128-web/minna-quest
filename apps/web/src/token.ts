// トークンの保存場所。身内数人しか使わないので localStorage で足りる（設計書 §5）。
const TOKEN_KEY = 'mq.token';

/**
 * 保存済みトークンを読む。無ければ null。
 * localStorage が例外を投げる状況（プライベートモード等）はここで握り潰さない。
 * 呼び出し側が「読めなかった」ことを知れないと、認証済みのはずが
 * 参加画面に戻り続ける原因が分からなくなる。
 */
export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

/** 参加成功時にトークンを保存する。 */
export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

/**
 * トークンを捨てる。401 を受け取ったとき、および明示的なログアウトで使う。
 * 捨てた後にまだ古いトークンで通信中のリクエストが残っていても、
 * その応答は画面には反映しない（api.ts 側の 401 処理を参照）。
 */
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}
