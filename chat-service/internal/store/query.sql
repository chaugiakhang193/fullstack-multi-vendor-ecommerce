-- name: CreateConversation :one
-- ON CONFLICT DO NOTHING: khi hai tab cung mo hoi thoai, request thua khong tao them
-- dong nao va nhan ve 0 row (pgx.ErrNoRows). Caller SELECT bu de lay dung hoi thoai da
-- ton tai. Khong dung DO UPDATE gia chi de luon co RETURNING: moi lan mo lai hoi thoai
-- cu se sinh mot dead tuple.
INSERT INTO conversation (id, type, owner_user_id, owner_guest_key, shop_id)
VALUES (@id, @type, sqlc.narg('owner_user_id'), sqlc.narg('owner_guest_key'), sqlc.narg('shop_id'))
ON CONFLICT DO NOTHING
RETURNING *;

-- name: GetDirectConversation :one
SELECT * FROM conversation
WHERE type = 'direct' AND owner_user_id = @owner_user_id AND shop_id = @shop_id;

-- name: GetBotConversationByUser :one
SELECT * FROM conversation
WHERE type = 'bot' AND owner_user_id = @owner_user_id;

-- name: GetBotConversationByGuest :one
SELECT * FROM conversation
WHERE type = 'bot' AND owner_guest_key = @owner_guest_key;

-- name: ListConversationsForUser :many
-- Inbox cua buyer. Hoi thoai chua co tin nhan nao (last_message_at NULL) xep cuoi.
--
-- So chua doc tinh bang LATERAL trong CUNG mot cau, khong phai goi CountUnread cho tung
-- dong: mot inbox 30 hoi thoai se thanh 31 luot di ve Neon, ma Neon nam o xa va co the
-- dang ngu.
--
-- p co the NULL (LEFT JOIN): hoi thoai ma nguoi xem chua co row participant. Luc do
-- IS DISTINCT FROM NULL dung cho MOI tin, tuc chua doc gi ca - dung y nghia can.
SELECT sqlc.embed(c), unread.total AS unread
FROM conversation c
LEFT JOIN participant p
    ON p.conversation_id = c.id AND p.user_id = @owner_user_id
LEFT JOIN LATERAL (
    SELECT count(*) AS total
    FROM message m
    WHERE m.conversation_id = c.id
      AND m.sender_participant_id IS DISTINCT FROM p.id
      AND m.created_at > COALESCE(p.last_read_at, '-infinity'::timestamptz)
) unread ON TRUE
WHERE c.owner_user_id = @owner_user_id
ORDER BY c.last_message_at DESC NULLS LAST
LIMIT @page_limit;

-- name: ListConversationsForShop :many
-- Inbox cua seller: truy hoi thoai theo shop_id chu KHONG qua participant, vi luc buyer mo
-- hoi thoai thi chat-service chua biet user_id cua seller.
--
-- Nhung so chua doc thi van phai qua participant, va do la mot join KHAC: seller chua tra
-- loi lan nao thi khong co row nao, va ca hoi thoai dem la chua doc.
SELECT sqlc.embed(c), unread.total AS unread
FROM conversation c
LEFT JOIN participant p
    ON p.conversation_id = c.id AND p.user_id = @viewer_user_id
LEFT JOIN LATERAL (
    SELECT count(*) AS total
    FROM message m
    WHERE m.conversation_id = c.id
      AND m.sender_participant_id IS DISTINCT FROM p.id
      AND m.created_at > COALESCE(p.last_read_at, '-infinity'::timestamptz)
) unread ON TRUE
WHERE c.type = 'direct' AND c.shop_id = @shop_id
ORDER BY c.last_message_at DESC NULLS LAST
LIMIT @page_limit;

-- name: GetConversationByID :one
-- Dung cho phan quyen doc: lay hoi thoai roi moi doi chieu voi nguoi goi. Tach khoi
-- GetDirectConversation vi o day chua biet nguoi goi la buyer hay seller, nen chua co
-- owner_user_id de loc.
SELECT * FROM conversation WHERE id = @id;

-- name: AddParticipant :one
INSERT INTO participant (id, conversation_id, role, user_id, guest_key)
VALUES (@id, @conversation_id, @role, sqlc.narg('user_id'), sqlc.narg('guest_key'))
ON CONFLICT DO NOTHING
RETURNING *;

-- name: GetParticipantByUser :one
SELECT * FROM participant
WHERE conversation_id = @conversation_id AND user_id = @user_id;

-- name: GetParticipantByRole :one
-- Dung de lay participant 'bot' cua mot hoi thoai (moi hoi thoai bot co dung mot).
SELECT * FROM participant
WHERE conversation_id = @conversation_id AND role = @role
LIMIT 1;

-- name: InsertMessage :one
INSERT INTO message (id, conversation_id, sender_participant_id, body)
VALUES (@id, @conversation_id, @sender_participant_id, @body)
RETURNING *;

-- name: TouchConversation :exec
UPDATE conversation
SET last_message_at = @last_message_at, last_message_preview = @last_message_preview
WHERE id = @id;

-- name: ListMessagesBefore :many
-- Phan trang keyset MOT cot nho id la UUIDv7 (sap theo thoi gian). before_id NULL =
-- trang dau tien. Tra ve moi nhat truoc; caller dao nguoc de hien thi.
SELECT * FROM message
WHERE conversation_id = @conversation_id
  AND (sqlc.narg('before_id')::uuid IS NULL OR id < sqlc.narg('before_id')::uuid)
ORDER BY id DESC
LIMIT @page_limit;

-- name: ListDirectMessagesBefore :many
-- Nhu ListMessagesBefore nhung kem vai cua nguoi gui, phuc vu chat 1-1.
--
-- Vi sao khong sua thang cau tren: nhanh bot cung goi no (RecentBotMessages), va nhanh do dang
-- chay tren prod. Doi kieu row cua mot cau dung chung se keo theo mot duong dang phuc vu nguoi
-- dung that. Gop hai duong lai la viec cua dot don dep sau.
--
-- JOIN thuong chu khong LEFT: message.sender_participant_id la NOT NULL va co khoa ngoai tro
-- sang participant, nen dong ben kia luon ton tai. LEFT o day chi lam nguoi doc tuong rang no
-- co the thieu.
SELECT sqlc.embed(m), p.role AS sender_role
FROM message m
JOIN participant p ON p.id = m.sender_participant_id
WHERE m.conversation_id = @conversation_id
  AND (sqlc.narg('before_id')::uuid IS NULL OR m.id < sqlc.narg('before_id')::uuid)
ORDER BY m.id DESC
LIMIT @page_limit;

-- name: MarkRead :exec
UPDATE participant SET last_read_at = @last_read_at WHERE id = @id;

-- name: IncrementBotUsage :one
-- TANG-ROI-SO-SANH, khong phai doc-roi-kiem: hai request cung doc 4/5 roi cung ghi 5 se
-- cho dung 6 luot. Upsert nay la MOT round-trip nguyen tu, tra ve so luot SAU khi tang —
-- caller chi viec so voi han muc.
INSERT INTO bot_usage_daily (subject_key, usage_date, message_count)
VALUES (@subject_key, @usage_date, 1)
ON CONFLICT (subject_key, usage_date)
DO UPDATE SET message_count = bot_usage_daily.message_count + 1, updated_at = now()
RETURNING message_count;

-- name: GetBotUsage :one
-- Chi de doc/hien thi (vd bao "con 2 luot"), KHONG dung lam cong tac kiem quota.
SELECT message_count FROM bot_usage_daily
WHERE subject_key = @subject_key AND usage_date = @usage_date;
