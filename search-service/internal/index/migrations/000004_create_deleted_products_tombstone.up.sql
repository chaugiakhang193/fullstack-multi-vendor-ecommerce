CREATE TABLE IF NOT EXISTS deleted_products_tombstone (
    product_id UUID PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
