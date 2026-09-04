import { clearToken } from './token.js';

// worker/src/respond.ts の封筒に合わせる。ここを変えるとAPI変更なしの前提が崩れる。
type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

/** 通信は成功したがサーバがエラーを返した場合。文言はそのまま画面に出してよい（設計書 §6）。 */
export class ApiError extends Error {}

/**
 * 401 専用のエラー。トークンが失効している合図なので、呼び出し側は
 * 再試行ではなく参加画面への引き戻しで扱う（ApiError と型で区別する）。
 */
export class UnauthorizedError extends ApiError {}

// worker/src/routes/vote.ts が締め済みの日に返す文言。今日の画面はこれを見て
// エラー表示ではなく読み直しに倒す（設計書 §6）。文字列比較なので、
// worker 側の文言を変えたらここも合わせて直す必要がある。
export const ALREADY_CLOSED_MESSAGE = 'this day is already closed';

export type JoinResult = { token: string; player: { id: string; name: string; worldId: string } };

export type TodayResult = {
  dayNo: number;
  chapter: number;
  optionIds: string[];
  myVote: string | null;
  chosenId: string | null;
  counts: Record<string, number> | null;
  tiebroken: boolean | null;
};

export type VoteResult = { dayNo: number; optionId: string };

export type WorldResult = {
  id: string;
  name: string;
  currentDay: number;
  chapter: number;
  tags: string[];
  history: Array<{
    dayNo: number;
    optionIds: string[];
    chosenId: string | null;
    counts: Record<string, number> | null;
    tiebroken: boolean | null;
  }>;
};

/**
 * 4本共通の応答処理。
 * 401 はここで一括して「トークンを捨てる」まで済ませる。各画面のcatch節で
 * 個別に忘れると、捨て漏れたトークンでリクエストを送り続けることになる。
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const body = (await response.json()) as Envelope<T>;

  if (response.status === 401) {
    clearToken();
    throw new UnauthorizedError(body.ok ? 'unauthorized' : body.error);
  }
  if (!body.ok) {
    throw new ApiError(body.error);
  }
  return body.data;
}

function withAuth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function join(code: string, name: string): Promise<JoinResult> {
  return request('/api/join', {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  });
}

export function fetchToday(token: string): Promise<TodayResult> {
  return request('/api/today', withAuth(token));
}

export function vote(token: string, optionId: string): Promise<VoteResult> {
  return request('/api/vote', {
    method: 'POST',
    body: JSON.stringify({ optionId }),
    ...withAuth(token),
  });
}

export function fetchWorld(token: string): Promise<WorldResult> {
  return request('/api/world', withAuth(token));
}
