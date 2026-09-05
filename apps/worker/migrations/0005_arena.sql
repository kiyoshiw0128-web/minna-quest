-- 闘技場（段階5）の進捗（設計書 §4）。個人ごとに開く塔で、倒した階だけ
-- 1行を持つ。到達階は列に持たず、この表の MAX(floor) から求める。
-- 列に持つと、行(実際に倒した記録)と列(自己申告の到達階)が食い違ったときに
-- どちらが正か決められなくなる（設計書 §4 がそう明記している）。
--
-- PRIMARY KEY (player_id, floor) が「同じ人の同じ階の記録は1つだけ」を保証する。
-- store.ts の recordArenaWin はこの行の有無そのものを「初回か」のガードにして
-- 報酬の文を並べる（battle_results と recordBattleWin の関係と同じ形）。
CREATE TABLE arena_progress (
  player_id  TEXT NOT NULL,
  floor      INTEGER NOT NULL,
  cleared_at TEXT NOT NULL,
  PRIMARY KEY (player_id, floor)
);

CREATE INDEX idx_arena_progress_player ON arena_progress (player_id);

-- その階を全体で最初に倒した人（設計書 §4）。world_id を持たないのは、
-- 「最初の1人」が世界をまたいだプレイヤー全体を通じた記録だから
-- （設計書：「`arena_first` は世界ではなく全体で持つ」）。
-- floor を主キーにすることで1階につき1行しか持てず、`INSERT ... WHERE NOT EXISTS`
-- で守れば二重に立たない（設計書 §8 テスト4）。
CREATE TABLE arena_first (
  floor      INTEGER PRIMARY KEY,
  player_id  TEXT NOT NULL,
  cleared_at TEXT NOT NULL
);
