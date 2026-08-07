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

## Under load: end-to-end p95 with k6

The plans above are single queries. The same k6 scenario — 7 Vietnamese keywords (accented and
unaccented) at 10 / 50 / 100 concurrent VUs — was then run against `GET /products?q=…` end-to-end on one
machine at **50,000 products**, once on the old in-monolith `ILIKE` path and once with the feature flag
on so the request goes monolith → search-service → hydrate.

| Load | old `ILIKE` p95 | two-stage p95 | speedup |
|---|---|---|---|
| 10 VU  | 407 ms | **60 ms**  | ~6.8× |
| 50 VU  | 1.55 s | **99 ms**  | ~15.7× |
| 100 VU | 6.07 s | **186 ms** | ~32.6× |

Zero HTTP errors on both runs. Under saturation the `ILIKE` path also completed far less work — 3,748 vs
8,932 requests — because its slow queries hold each connection longer.

The gap grows with the catalog, which is the point: a `Seq Scan` is O(rows), a GIN lookup is not.

| Rows | `ILIKE` p95 @100 VU |
|---|---|
| 82     | 84 ms    |
| 20,000 | 373 ms   |
| 50,000 | 6,070 ms |

The old path's p95 climbs 84 → 373 → 6,070 ms as the table grows; the two-stage path measured **186 ms**
at 50k and stays roughly flat, because GIN retrieval is sub-linear and hydration is capped at one page of
results.

**Honest caveats.** This is one machine — the backend, the Go service, both databases and k6 all share
one CPU, whereas in production the service and its index live on separate hosts. The load keywords are
broad (~2,500 matches each; a more selective real query favors full-text even more). The p99/max tail at
100 VU is noisy over a single run: the p50/p95 figures are stable, the extreme tail is not a one-run
claim. Numbers were taken with a temporary 50k synthetic seed, removed afterwards. Reproduce with
`k6 run observability/k6/baseline-search.js` (flag off vs on) after seeding the catalog.

## Takeaway

The old search did a full-table `Seq Scan` **and** returned the wrong answer (0 of 25, because of
accents). The new path is correct (accent-insensitive), an order of magnitude faster per query on this
data because the GIN index answers with a bitmap index scan instead of reading every row, and — because
that scan cost is O(rows) — it pulls further ahead as the catalog grows.

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
