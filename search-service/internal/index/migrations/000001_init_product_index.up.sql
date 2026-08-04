-- unaccent: full-text tim khong dau. pg_trgm: fuzzy/trigram match. Neon co san ca hai,
-- role mac dinh duoc phep CREATE EXTENSION.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- product_index: projection doc-only cua product ben monolith, khop
-- ProductSearchSnapshotPayload. Khong co cot stock: stock doi theo tung don hang, nhung
-- luong order khong ghi outbox product.* nen cot se sai ngay sau don dau tien.
CREATE TABLE product_index (
    product_id    uuid PRIMARY KEY,
    name          text NOT NULL,
    slug          text NOT NULL,
    description   text,
    price         numeric(12,2) NOT NULL,
    shop_id       uuid NOT NULL,
    category_id   uuid,
    thumbnail_url text,
    status        text NOT NULL,
    is_hidden     boolean NOT NULL,
    -- Moc thoi gian ban ghi nguon (payload.updatedAt). RabbitMQ khong dam bao thu tu nen
    -- upsert dung cot nay de bo qua event cu hon ban dang luu.
    updated_at    timestamptz NOT NULL,
    -- Luc consumer ghi vao index (khac updated_at cua nguon). Phuc vu debug.
    indexed_at    timestamptz NOT NULL DEFAULT now(),
    -- Populate qua trigger unaccent+setweight sau; hien de NULL.
    search_vector tsvector
);

-- GIN xu ly cot NULL binh thuong (khong tao entry nao), nen tao index truoc luc con
-- trong van an toan.
CREATE INDEX product_index_search_vector_gin ON product_index USING gin (search_vector);

-- processed_events: idempotency y het notification-service. event_id la eventId cua
-- outbox envelope (uuid). Insert TRUOC khi apply; trung (Postgres 23505) = da xu ly.
CREATE TABLE processed_events (
    event_id   uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);
