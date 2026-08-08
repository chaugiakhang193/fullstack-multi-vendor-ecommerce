-- CHI phuc vu sqlc doc hinh dang bang (khong chay len DB). PHAI khop cot voi
-- migration 000001_init_product_index.up.sql. sqlc khong doc thu muc migrations/
-- vi no vap CREATE FUNCTION/TRIGGER + backfill UPDATE cua 000002.

-- Khai bao extension de sqlc NAP signature ham cua chung (unaccent, ts_rank_cd du la
-- core). Thieu dong nay sqlc co the bao "function unaccent(text) does not exist" luc
-- generate vi unaccent la contrib, khong phai ham loi.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
    updated_at    timestamptz NOT NULL,
    indexed_at    timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector,
    name_unaccent text
);
