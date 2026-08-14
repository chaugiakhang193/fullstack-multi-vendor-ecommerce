-- Ba bang lam nen cho ca hai luong: chatbot va chat 1-1 giua buyer va seller.
-- Bot khong phai he thong rieng, no la mot loai participant.

CREATE TABLE conversation (
    id                   UUID PRIMARY KEY,
    -- 'bot'    : hoi thoai giua mot nguoi (hoac khach vang lai) voi tro ly AI
    -- 'direct' : hoi thoai 1-1 giua buyer va shop
    type                 TEXT NOT NULL CHECK (type IN ('bot', 'direct')),

    -- Chu so huu hoi thoai. Buyer luon la chu so huu cua hoi thoai direct, vi seller
    -- khong duoc mo hoi thoai truoc (chong spam tu phia shop).
    -- Dung mot khai niem owner cho ca 3 truong hop de 3 unique index ben duoi cung dang.
    owner_user_id        UUID,
    owner_guest_key      TEXT,

    -- Chi hoi thoai direct moi co. chat-service KHONG co bang shop, day chi la id tham chieu.
    shop_id              UUID,

    -- Denormalize de inbox khong phai join sang message: inbox la man doc-nhieu nhat.
    last_message_at      TIMESTAMPTZ,
    last_message_preview TEXT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Hoi thoai bot khong co shop; hoi thoai direct bat buoc co ca buyer lan shop.
    CONSTRAINT conversation_shape CHECK (
        (type = 'bot'    AND shop_id IS NULL) OR
        (type = 'direct' AND shop_id IS NOT NULL AND owner_user_id IS NOT NULL)
    ),

    -- Dung mot chu so huu: hoac tai khoan that, hoac khach vang lai, khong the ca hai.
    CONSTRAINT conversation_owner_exactly_one CHECK (
        (owner_user_id IS NOT NULL) <> (owner_guest_key IS NOT NULL)
    )
);

-- Ba unique index chong trung. Dung partial index thay vi kiem o tang app: hai tab bam
-- "Chat voi shop" cung luc thi kiem o app se thua race va de ra hai hoi thoai, tin nhan
-- chia doi. De DB lam trong tai, con app dung INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX conversation_bot_user_uniq
    ON conversation (owner_user_id)
    WHERE type = 'bot' AND owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX conversation_bot_guest_uniq
    ON conversation (owner_guest_key)
    WHERE type = 'bot' AND owner_guest_key IS NOT NULL;

CREATE UNIQUE INDEX conversation_direct_uniq
    ON conversation (owner_user_id, shop_id)
    WHERE type = 'direct';

-- Inbox cua buyer: "hoi thoai cua toi, moi nhat truoc". Phuc vu ca hoi thoai bot lan direct.
CREATE INDEX conversation_owner_recent_idx
    ON conversation (owner_user_id, last_message_at DESC)
    WHERE owner_user_id IS NOT NULL;

-- Inbox cua seller: truy theo shop_id chu KHONG qua participant. Ly do: luc buyer mo hoi
-- thoai, chat-service biet shop_id nhung KHONG biet user_id cua seller (khong co bang shop),
-- nen row participant cua seller duoc tao muon (xem participant ben duoi).
CREATE INDEX conversation_shop_recent_idx
    ON conversation (shop_id, last_message_at DESC)
    WHERE type = 'direct';


CREATE TABLE participant (
    id              UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'seller', 'admin', 'bot')),

    user_id         UUID,
    guest_key       TEXT,

    -- Da doc toi thoi diem nao. Mot dong UPDATE moi lan mo hoi thoai, thay vi danh dau
    -- tung message (N dong UPDATE cho mot lan mo).
    last_read_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Bot khong phai nguoi nen khong co danh tinh; con lai bat buoc dung MOT trong hai.
    CONSTRAINT participant_identity_exactly_one CHECK (
        (role =  'bot' AND user_id IS NULL AND guest_key IS NULL) OR
        (role <> 'bot' AND ((user_id IS NOT NULL) <> (guest_key IS NOT NULL)))
    )
);

-- Mot nguoi khong the vao cung mot hoi thoai hai lan (vd bam mo hoi thoai o hai tab).
CREATE UNIQUE INDEX participant_conversation_user_uniq
    ON participant (conversation_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX participant_user_idx
    ON participant (user_id)
    WHERE user_id IS NOT NULL;


CREATE TABLE message (
    -- UUIDv7 sinh o Go, KHONG dung DEFAULT uuidv7(): Neon la PG18 co san ham do nhung
    -- Postgres local va service container cua CI la 16, migration se gay dung o do.
    id                    UUID PRIMARY KEY,
    conversation_id       UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    sender_participant_id UUID NOT NULL REFERENCES participant(id) ON DELETE CASCADE,

    body                  TEXT NOT NULL CHECK (char_length(body) <= 4000),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MOT index phuc vu ca sap xep lan phan trang. Lam duoc vi id la UUIDv7 sap theo thoi
-- gian: con tro keyset chi can mot cot (WHERE id < $cursor), khong can cap (created_at, id).
CREATE INDEX message_conversation_recent_idx
    ON message (conversation_id, id DESC);
