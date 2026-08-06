-- Search product theo full-text: match websearch_to_tsquery + xep hang ts_rank_cd.
-- Tra product_id + rank (Pattern B: monolith hydrate data day du tu DB chinh).
-- status = 'active' (chu THUONG, ProductStatus.ACTIVE) — loai deleted/suspended.
-- Cac filter nullable dung sqlc.narg: NULL = bo qua dieu kien do.

-- name: SearchProducts :many
SELECT
    product_id,
    ts_rank_cd(search_vector, websearch_to_tsquery('simple', unaccent(@query::text))) AS rank
FROM product_index
WHERE search_vector @@ websearch_to_tsquery('simple', unaccent(@query::text))
  AND status = 'active'
  AND is_hidden = false
  AND (sqlc.narg('min_price')::numeric IS NULL OR price >= sqlc.narg('min_price')::numeric)
  AND (sqlc.narg('max_price')::numeric IS NULL OR price <= sqlc.narg('max_price')::numeric)
  AND (sqlc.narg('shop_id')::uuid IS NULL OR shop_id = sqlc.narg('shop_id')::uuid)
  AND (sqlc.narg('category_ids')::uuid[] IS NULL OR category_id = ANY(sqlc.narg('category_ids')::uuid[]))
ORDER BY rank DESC, product_id
LIMIT @page_limit::int OFFSET @page_offset::int;

-- name: CountSearchProducts :one
SELECT count(*) AS total
FROM product_index
WHERE search_vector @@ websearch_to_tsquery('simple', unaccent(@query::text))
  AND status = 'active'
  AND is_hidden = false
  AND (sqlc.narg('min_price')::numeric IS NULL OR price >= sqlc.narg('min_price')::numeric)
  AND (sqlc.narg('max_price')::numeric IS NULL OR price <= sqlc.narg('max_price')::numeric)
  AND (sqlc.narg('shop_id')::uuid IS NULL OR shop_id = sqlc.narg('shop_id')::uuid)
  AND (sqlc.narg('category_ids')::uuid[] IS NULL OR category_id = ANY(sqlc.narg('category_ids')::uuid[]));
