-- 段階11: メールで合言葉を取り戻す（docs/superpowers/specs/2026-09-06-email-recovery-design.md）。
--
-- email は任意・平文。送信先として使うのでハッシュにはできない（設計書 §3）。
--
-- recovery_token は「いまの合言葉」をそのまま再送するための控え。
-- players.token_hash は不可逆なので、ここに控えておかない限り、後から
-- 合言葉を復元して送りようがない（apps/worker/src/auth.ts 参照）。
-- 控えられるのは /api/email がBearer認証（＝本人が今その合言葉を使えている
-- ことの証明）を通った瞬間だけなので、メールを登録していない・削除した
-- プレイヤーの合言葉は平文でどこにも残らない。
--
-- recovery_sent_at は直近の送信時刻。10分に1通の連投防止に使う（設計書 §2.4）。
ALTER TABLE players ADD COLUMN email TEXT;
ALTER TABLE players ADD COLUMN recovery_token TEXT;
ALTER TABLE players ADD COLUMN recovery_sent_at TEXT;
