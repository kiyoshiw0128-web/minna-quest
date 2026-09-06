-- 段階11 訂正（docs/superpowers/specs/2026-09-06-email-recovery-design.md §2.1）。
--
-- 0008 で足した players.recovery_token は「いまの合言葉」をそのまま平文で
-- 控えるための列だった。実装してみると、これは生きた認証情報の平文控えそのもの。
-- players.token_hash も invites.code_hash も不可逆なハッシュしか持たないのに、
-- この列だけがデータベースの漏洩即なりすましという特別な弱さを持っていた。
--
-- 作り直し（新しい合言葉を発行する）を避けていた理由（アドレスを知っている人が
-- 繰り返し要求して本人を締め出せる）は実際には弱かった。作り直しても本人には
-- メールで新しいものが届くので、締め出しではなく手間が増えるだけである。
-- 10分に1通の連投制限（recovery_sent_at）もある。恒久的な弱体化とは釣り合わない。
--
-- したがって recovery_token は列ごと廃止し、代わりに使い捨ての復旧コードの
-- ハッシュと有効期限だけを持つ。コードが実際に使われたときに初めて、
-- confirmRecovery（apps/worker/src/store.ts）が新しい合言葉を発行する。
-- 平文はどこにも残らない。
ALTER TABLE players DROP COLUMN recovery_token;
ALTER TABLE players ADD COLUMN recovery_code_hash TEXT;
ALTER TABLE players ADD COLUMN recovery_expires_at TEXT;
