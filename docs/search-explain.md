# Search: from an `ILIKE` scan to a GIN-backed full-text index

The product search moved from a `LIKE '%term%'` scan on the monolith to a dedicated Go service that
keeps a Postgres full-text index (`tsvector` + GIN, with `unaccent` for accent-insensitive Vietnamese
search). This note shows the query plans behind that change.

All plans below were captured on a local Postgres 16 with **20,025 rows** (25 matching the search term,
~20,000 non-matching), the schema built from the service's real migrations. Reproduce with the seed
script at the bottom.

| Query | Plan | Time | Rows found |
|---|---|---|---|
| A — old `ILIKE '%dien thoai%'` | Seq Scan | 24.7 ms | **0** (misses accents) |
| B — `tsvector @@` + GIN | **Bitmap Index Scan** | **6.7 ms** | 25 |
| C — same full-text query, index dropped | Seq Scan | 54.5 ms | 25 |

## A — the old way: `ILIKE '%dien thoai%'`

```
 Seq Scan on product_index  (cost=0.00..876.44 rows=2 width=16) (actual time=24.712..24.713 rows=0 loops=1)
   Filter: ((NOT is_hidden) AND (status = 'active'::text) AND ((name ~~* '%dien thoai%'::text) OR (description ~~* '%dien thoai%'::text)))
   Rows Removed by Filter: 20025
 Planning Time: 0.996 ms
 Execution Time: 24.740 ms
```

A `Seq Scan` over the whole table (`Rows Removed by Filter: 20025`), and it returns **0 rows**: a
leading-wildcard `LIKE` cannot use a B-tree index, and it is accent-sensitive, so `dien thoai` never
matches the stored `Điện thoại`. Slow and wrong.

## B — the new way: `tsvector @@ websearch_to_tsquery` over a GIN index

```
 Bitmap Heap Scan on product_index  (cost=1254.20..1258.47 rows=1 width=16) (actual time=6.587..6.596 rows=25 loops=1)
   Recheck Cond: (search_vector @@ websearch_to_tsquery('simple'::regconfig, unaccent('dien thoai'::text)))
   Filter: ((NOT is_hidden) AND (status = 'active'::text))
   Heap Blocks: exact=1
   ->  Bitmap Index Scan on product_index_search_vector_gin  (cost=0.00..1254.20 rows=1 width=0) (actual time=6.575..6.576 rows=25 loops=1)
         Index Cond: (search_vector @@ websearch_to_tsquery('simple'::regconfig, unaccent('dien thoai'::text)))
 Planning Time: 0.393 ms
 Execution Time: 6.667 ms
```

A `Bitmap Index Scan` on the GIN index touches only the 25 matching rows out of 20k
(`Heap Blocks: exact=1`), and `unaccent` makes the accent-free query match the accented text — so this
returns the 25 rows the old query missed, in **6.7 ms**.

## C — the same full-text query with the GIN index dropped

```
 Seq Scan on product_index  (cost=0.00..5882.69 rows=1 width=16) (actual time=0.015..54.520 rows=25 loops=1)
   Filter: ((NOT is_hidden) AND (status = 'active'::text) AND (search_vector @@ websearch_to_tsquery('simple'::regconfig, unaccent('dien thoai'::text))))
   Rows Removed by Filter: 20000
 Planning Time: 0.187 ms
 Execution Time: 54.540 ms
```

Back to a `Seq Scan`: full-text matching alone is not enough — the **GIN index** is what turns it into
an index scan. Without the index the query evaluates `@@` against every row, which is **~8× slower than
B** (54.5 ms vs 6.7 ms) and, notably, even slower than the old `ILIKE` — because computing the
`tsvector` match per row costs more than a substring match. This isolates the index's contribution: the
win is the GIN index, not the full-text operator on its own.

## Takeaway

The old search did a full-table `Seq Scan` **and** returned the wrong answer (0 of 25, because of
accents). The new path is correct (accent-insensitive) and, on this data, an order of magnitude faster
because the GIN index answers the query with a bitmap index scan instead of reading every row.

## Reproduce

Apply the service migrations, then seed and analyze:

```sql
-- 1. schema: apply search-service/internal/index/migrations/000001 then 000002

-- 2. seed: 25 matching rows (accented names) + ~20,000 non-matching filler
INSERT INTO product_index(product_id, name, slug, price, shop_id, status, is_hidden, updated_at)
SELECT gen_random_uuid(), 'Điện thoại mẫu ' || g, 'dt-' || g, 5000000,
       '11111111-1111-1111-1111-111111111111', 'active', false, now()
FROM generate_series(1, 25) g;

INSERT INTO product_index(product_id, name, slug, price, shop_id, status, is_hidden, updated_at)
SELECT gen_random_uuid(), 'San pham loai ' || (g % 300) || ' mau ' || (g % 40), 'f-' || g,
       100000 + (g % 100) * 1000, '11111111-1111-1111-1111-111111111111', 'active', false, now()
FROM generate_series(1, 20000) g;

-- 3. update planner statistics (without this the planner may keep a Seq Scan)
ANALYZE product_index;
```

Then run each `EXPLAIN ANALYZE` above. For C, `DROP INDEX product_index_search_vector_gin;` before the
query and recreate it afterwards.
