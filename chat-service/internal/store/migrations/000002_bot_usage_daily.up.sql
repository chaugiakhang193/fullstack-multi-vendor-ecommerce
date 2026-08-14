-- Dem luot dung bot theo ngay. Mot bang phuc vu CA hai tang quota va tran toan service,
-- nho subject_key mang tien to:
--   'ip:14.169.17.140'                            -> quota khach vang lai
--   'user:9f2c...-uuid'                           -> quota tai khoan da dang nhap
--   'global'                                      -> tran toan service (BOT_DAILY_GLOBAL_LIMIT)
--
-- usage_date do tang ung dung tinh theo Asia/Ho_Chi_Minh roi truyen xuong, khong dung
-- now() AT TIME ZONE trong SQL: nhu vay test khong phu thuoc cau hinh timezone cua DB,
-- va Neon/CI/local khong can giong nhau.
--
-- Ten cot la usage_date chu khong phai "day" de tranh nham voi don vi interval cua Postgres.
CREATE TABLE bot_usage_daily (
    subject_key   TEXT        NOT NULL,
    usage_date    DATE        NOT NULL,
    message_count INTEGER     NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (subject_key, usage_date)
);
