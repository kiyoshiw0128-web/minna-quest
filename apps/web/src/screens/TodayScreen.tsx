import { AdventureMap } from '../AdventureMap.js';
import { eventLocation, LOCATIONS, locationDescription, chapterStory, routeTo } from '../geography.js';
import type { LocationId } from '../geography.js';
import { StoryBattle } from './StoryBattle.js';
import { QUESTS, questProgress, isBossDay } from '@mq/core';
import { useCallback, useEffect, useState } from 'react';
import { fetchToday, vote as voteApi, ApiError, UnauthorizedError, ALREADY_CLOSED_MESSAGE } from '../api.js';
import type { TodayResult } from '../api.js';
import { resolveEvent } from '../events.js';

type Props = {
  token: string;
  // 401 を検知した後の後始末は App 側（トークンの状態を握っている）に任せる。
  // ここで直接どうにかしようとすると、画面切り替えのタイミングがずれる。
  onUnauthorized: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: TodayResult };

type VoteState = { kind: 'idle' } | { kind: 'voting' } | { kind: 'error'; message: string };

export function TodayScreen({ token, onUnauthorized }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [voteState, setVoteState] = useState<VoteState>({ kind: 'idle' });
  const [battleRefreshError, setBattleRefreshError] = useState(false);

  async function refreshAfterBattle(): Promise<void> {
    try {
      const data = await fetchToday(token);
      // 戦闘の行動表と今の試行結果を残したまま、依頼だけ最新にする。
      setLoad({ kind: 'loaded', data });
      setBattleRefreshError(false);
    } catch (error) {
      if (error instanceof UnauthorizedError) onUnauthorized();
      else setBattleRefreshError(true);
    }
  }

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const data = await fetchToday(token);
      setLoad({ kind: 'loaded', data });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // トークンは api.ts 側で既に破棄済み。ここで setState すると、
        // App が参加画面へ切り替える直前に一瞬エラー表示が挟まってしまうので何もしない。
        onUnauthorized();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setLoad({ kind: 'error', message });
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleVote(optionId: string): Promise<void> {
    setVoteState({ kind: 'voting' });
    try {
      await voteApi(token, optionId);
      setVoteState({ kind: 'idle' });
      await reload();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      if (error instanceof ApiError && error.message === ALREADY_CLOSED_MESSAGE) {
        // 投票しようとした瞬間に締切と競合したケース。エラーを出して古い3択を
        // 残すと「まだ投票できる」ように見え続けるので、今日の画面を読み直す。
        setVoteState({ kind: 'idle' });
        await reload();
        return;
      }
      const message = error instanceof ApiError ? error.message : '通信に失敗しました';
      setVoteState({ kind: 'error', message });
    }
  }

  if (load.kind === 'loading') {
    return (
      <main>
        <h1>今日</h1>
        <p>読み込み中…</p>
      </main>
    );
  }

  if (load.kind === 'error') {
    return (
      <main>
        <h1>今日</h1>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { data } = load;
  const closed = data.chosenId !== null;
  const lastEventId = data.chosenId ?? data.previousChosenId ?? null;
  const location = eventLocation(lastEventId) ?? (data.dayNo === 1 && lastEventId === null ? 'leaf' : null);
  const tags = data.tags ?? [];
  const quests = questProgress(tags);
  const resultDay = closed ? data.dayNo : data.dayNo - 1;
  const hasResultBattle = resultDay > 0 && (isBossDay(resultDay) || (lastEventId !== null && resolveEvent(lastEventId).kind === 'battle'));

  return (
    <main className="today-screen">
      <header className="journey-heading">
        <p className="screen-caption">JOURNEY</p>
        <h1>{data.chapter}章 {data.dayNo}日目</h1>
      </header>
      <AdventureMap current={location} />
      <p className="chapter-story">{chapterStory(data.chapter, tags)}</p>
      <ScenarioPanel data={data} closed={closed} />
      <div className="location-story">
        <h2>{location !== null ? `${LOCATIONS[location].symbol} ${LOCATIONS[location].name}` : '◆ 旅の途中'}</h2>
        <p>{location !== null ? locationDescription(location, tags) : '街道の先には、まだ知らない土地が広がっている。'}</p>
      </div>

      {hasResultBattle && <StoryBattle key={resultDay} token={token} onUnauthorized={onUnauthorized} dayNo={resultDay} onResolved={() => void refreshAfterBattle()} />}
      {battleRefreshError && <p role="alert">戦闘結果は保存されましたが、依頼の表示を更新できませんでした。画面を開き直してください。</p>}

      {quests.length > 0 && <section className="quest-journal" aria-label="依頼の手帳">
        <span className="eyebrow">QUESTS</span><h2>依頼</h2>
        <ul>{quests.map((quest) => <li key={quest.id}>
          <strong>{quest.completed ? '✓' : '◇'} {quest.name}</strong>
          <p>{quest.completed ? '完了' : quest.awaitingBattle
            ? `${quest.step.objective}。「戦闘」から挑戦できます。`
            : `${quest.step.objective} · ${LOCATIONS[quest.step.location].name}`}</p>
        </li>)}</ul>
      </section>}

      {closed ? <ClosedDay data={data} /> : <OpenDay key={data.dayNo} current={location} data={data} onVote={handleVote} voteState={voteState} />}
    </main>
  );
}

function ScenarioPanel({ data, closed }: { data: TodayResult; closed: boolean }) {
  const recentIds = data.recentChosenIds ?? (data.previousChosenId ? [data.previousChosenId] : []);
  const recapIds = closed && recentIds.at(-1) === data.chosenId ? recentIds.slice(0, -1) : recentIds;
  const recent = recapIds
    .map(resolveEvent)
    .filter((event) => event.resultText !== null)
    .slice(-3);
  const focusId = closed ? data.chosenId : (data.storyFocusId ?? data.optionIds[0] ?? null);
  const focus = focusId === null ? null : resolveEvent(focusId);
  const quest = focusId === null ? undefined : QUESTS.find((candidate) =>
    candidate.steps.some((step) => step.eventId === focusId));
  const episode = quest?.steps.findIndex((step) => step.eventId === focusId) ?? -1;
  const objective = episode < 0 ? null : quest?.steps[episode]?.objective ?? null;

  if (recent.length === 0 && focus === null) return null;
  return (
    <section className="scenario-panel" aria-label="現在のシナリオ">
      <p className="screen-caption">STORY SO FAR</p>
      {recent.length === 0
        ? <p>一行の冒険は、ここから始まる。</p>
        : <div className="previous-story">
            {recent.slice(-1).map((event) => <p key={event.id} className="scenario-recap">{event.resultText}</p>)}
          </div>}
      {focus !== null && <div className="scenario-focus">
        <h2>{data.storyGuided && !closed ? 'Jevが選んだ今回の本筋' : '今回の本筋'}</h2>
        {quest !== undefined && episode >= 0
          ? <>
              <strong>「{quest.name}」第{episode + 1}話 / 全{quest.steps.length}話</strong>
              <p>{objective}。物語は「{focus.label}」へ続こうとしている。</p>
            </>
          : <p>これまでの出来事を受け、次は「{focus.label}」が物語の焦点になる。</p>}
      </div>}
    </section>
  );
}

function OpenDay({
  current,
  data,
  onVote,
  voteState,
}: {
  current: LocationId | null;
  data: TodayResult;
  onVote: (optionId: string) => void;
  voteState: VoteState;
}) {
  const [selected, setSelected] = useState<string | null>(data.myVote);
  const submitting = voteState.kind === 'voting';
  return (
    <section className="daily-choices">
      <span className="eyebrow">NEXT MOVE</span><h2 aria-label="∞ 次回行動選択">次の行動</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (selected !== null && !submitting && selected !== data.myVote) onVote(selected);
      }}>
        <fieldset className="journey-options" disabled={submitting}>
          <legend>どこへ進みますか？</legend>
          {data.optionIds.map((optionId) => {
            const event = resolveEvent(optionId);
            const destination = eventLocation(optionId);
            const route = current !== null && destination !== null ? routeTo(current, destination) : [];
            const direction = destination === null ? '' : `${LOCATIONS[destination].name}${destination === current ? 'で' : 'へ'}`;
            return (
              <label key={optionId} className="journey-option">
                <input type="radio" name="next-action" value={optionId} checked={selected === optionId} onChange={() => setSelected(optionId)} />
                <span>{destination !== null && <span className="destination">{direction}</span>}{event.label}{event.kind !== null && ` (${event.kind === 'battle' ? '戦闘' : '出来事'})`}{route.length > 1 && <small className="journey-route">街道：{route.map((place) => LOCATIONS[place].name).join(' → ')}</small>}</span>
              </label>
            );
          })}
        </fieldset>
        <button className="journey-confirm" type="submit" disabled={selected === null || submitting || selected === data.myVote}>{submitting ? '送信中…' : '決定'}</button>
      </form>
      <p className="journey-vote-status" role="status">{data.myVote === null ? '毎朝5時に決定' : `投票済み：${resolveEvent(data.myVote).label}`}</p>
      <span className="sr-only">票数: まだ分かりません（締まるまで公開されません）</span>
      {voteState.kind === 'error' && <p role="alert">{voteState.message}</p>}
    </section>
  );
}

function ClosedDay({ data }: { data: TodayResult }) {
  const chosen = resolveEvent(data.chosenId as string);
  return (
    <section className="journey-story">
      <h2>今日決まったこと: {chosen.label}</h2>
      {/*
        名前と票数だけだと「分かれ道に決まりました」で終わり、何が起きたのか
        分からない。毎日の選択で冒険が変わる遊びなので、変わった中身が読めないと
        選んだ意味がその場で消える。
      */}
      {chosen.resultText !== null && <p className="narrative">{chosen.resultText}</p>}
      <h3>票の割れ方</h3>
      <ul>
        {data.optionIds.map((optionId) => {
          const event = resolveEvent(optionId);
          const count = data.counts?.[optionId] ?? 0;
          return (
            <li key={optionId}>
              {event.label}: {count}票
            </li>
          );
        })}
      </ul>
      {data.tiebroken === true && <p>同数だったため、シードで決定しました。</p>}
    </section>
  );
}
