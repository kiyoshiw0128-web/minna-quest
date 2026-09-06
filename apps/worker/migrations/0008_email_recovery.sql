-- 段階11: メールで合言葉を取り戻す（docs/superpowers/specs/2026-09-06-email-recovery-design.md）。
--
-- email は任意・平文。送信先として使うのでハッシュにはできない（設計書 §3）。
--
-- recovery_token は「いまの合言葉」をそのまま再送するための控えとして
-- 追加したが、これは生きた認証情報の平文控えであり、データベースが漏れた
-- 瞬間にメール登録済みの全員がなりすまされるという弱さを持っていた。
-- 2026-09-06にこの方式を撤回し、0009_recovery_codes.sql で列ごと廃止した。
-- 経緯は設計書 §2.1 と 0009 のコメントを参照。
--
-- recovery_sent_at は直近の送信時刻。10分に1通の連投防止に使う（設計書 §2.4）。
-- この列は0009以降も使い続ける。
ALTER TABLE players ADD COLUMN email TEXT;
ALTER TABLE players ADD COLUMN recovery_token TEXT;
ALTER TABLE players ADD COLUMN recovery_sent_at TEXT;
