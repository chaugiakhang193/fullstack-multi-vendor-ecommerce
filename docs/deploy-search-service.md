# Deploying the search service

The search service is both a RabbitMQ consumer and a Go HTTP server. It builds a service-owned search
read model in Neon DB#3, serves ranked product ids to the monolith at `GET /search`, and serves a
small display-safe result to the chatbot at `GET /search/detailed`.

It is packaged as a container image, published to GHCR by CI, and deployed as a Render web service.
See [search-architecture.md](search-architecture.md) for the data path and
[observability.md](observability.md) for the metrics and traces referenced by this runbook.

## Where it runs, and why not through the Blueprint

The production services are split across the default workspaces of two Render accounts:

- account #1's workspace runs the monolith and notification service;
- account #2's workspace runs search and chat as separate web services.

Search therefore has its own process, rollout and restart boundary, but it **shares account #2's
workspace free-instance allowance with chat**. Render currently grants 750 free instance hours per
workspace;
keeping both services awake continuously would consume two running instances. Search intentionally
has no external keep-warm cron. See [Render's free-instance limits](https://render.com/docs/free).

The repository's `render.yaml` Blueprint is intentionally not used for workspace #2. That file
describes the monolith and notification service in workspace #1. Applying the whole Blueprint in
workspace #2 would duplicate them there, while adding search or chat to it would make workspace #1
create those services on its next sync.

## Image and release path

CI builds `search-service/Dockerfile` and publishes:

```text
ghcr.io/chaugiakhang193/fullstack-multi-vendor-ecommerce-search:latest
```

It also publishes a commit-SHA tag. The Docker job runs only after the repository build job succeeds
on a push to `main`. It then calls the search deploy hook if `RENDER_DEPLOY_HOOK_SEARCH` exists; an
unset secret is deliberately a successful no-op, so a green CI run alone does not prove Render was
redeployed.

This credentialless setup keeps the GHCR package Public. A private image would require a separately
configured [registry credential](https://render.com/docs/deploying-an-image).

## Creating the Render service

1. New → Web Service → **Existing Image**.
2. Use the GHCR image above, the Free instance type and the Singapore region.
3. Set the health check path to `/health`; the service has no global URL prefix.
4. Add the environment variables below. Do not override the image command.
5. Deploy, then copy Settings → Deploy Hook into the GitHub repository secret
   `RENDER_DEPLOY_HOOK_SEARCH`.

The distroless image starts `/search-service` directly. Embedded database migrations run before the
HTTP port opens, followed by a 15-second database-pool startup check. A missing database URL, failed
migration or failed initial database ping stops the process, so Render will not promote that deploy.

## Environment variables

| Key | Production value | Behaviour |
|---|---|---|
| `DATABASE_URL` | Neon DB#3 connection string with `sslmode=require` | Required. Missing, malformed or unreachable DB configuration fails startup before `/health` is available |
| `RABBITMQ_URL` | CloudAMQP connection string shared with the monolith | Operationally required. If omitted, the code falls back to local RabbitMQ and keeps retrying while HTTP still looks healthy |
| `SEARCH_QUEUE_NAME` | leave unset | Defaults to `search_index.v2.q`; do not restore the obsolete `search_index.q` override |
| `LOG_LEVEL` | `info` | Accepts `debug`, `info`, `warn` or `error`; other values behave as `info` |
| `SEARCH_RETENTION_GC_ENABLED` | `false` for the first rollout | Gauges always run; only startup-and-hourly deletion of tombstones and processed-event rows is disabled. Enable after checking the retention metrics |
| `OTEL_ENABLED` | `false` unless traces have a destination | Tracing is opt-in and does not gate business traffic |
| `OTEL_SERVICE_NAME` | leave unset | Defaults to `search-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP traces endpoint | Required in practice when tracing is enabled; the local default is `http://localhost:4318/v1/traces` |
| `OTEL_TRACES_SAMPLER_ARG` | leave unset, or a number from `0` to `1` | Empty keeps all root traces. Invalid or out-of-range input logs a warning and continues with a usable fallback or clamped ratio |

Render injects `PORT`, and the service reads it before `SEARCH_HTTP_PORT`, then falls back to `8090`.
Set neither port variable by hand on Render. Listening anywhere other than Render's `PORT` fails the
platform health check.

The `.v2` queue suffix is not cosmetic. Version 2 added TTL and dead-letter arguments, and RabbitMQ
rejects changing arguments on an existing queue with `406 PRECONDITION_FAILED`. A stale dashboard
override of `search_index.q` can therefore leave `/health` green while the consumer reconnects forever.

## What `/health` does—and does not—prove

`GET /health` is a process-liveness probe that always returns:

```json
{"status":"ok"}
```

It does not query Postgres and does not inspect RabbitMQ. Database failures during boot are caught
before the server starts, but a database failure after boot makes search return `500` without changing
`/health`. RabbitMQ is deliberately a soft runtime dependency: the consumer reconnects forever using
a 1 / 2 / 5 / 10 / 30-second base backoff with ±20% jitter while the HTTP server remains available.

Use three independent signals after every deploy:

1. Render logs contain `migration xong`, `HTTP server lang nghe` and `consumer online`.
2. CloudAMQP shows one consumer on `search_index.v2.q`, plus the durable
   `search_index.v2.q.retry` and `search_index.v2.q.dlq` queues.
3. `/search` can execute a real database query, and `/metrics` exposes the search gauges.

## First deployment and safe cutover

A fresh DB can migrate successfully and return `200` from both `/health` and an empty search. Empty is
a valid result, so the monolith will not fall back to `ILIKE` merely because the index has never been
backfilled. Keep callers disabled until the read model is demonstrably populated.

1. Leave the monolith's `SEARCH_SERVICE_ENABLED=false`, and do not set chat's
   `SEARCH_SERVICE_URL` yet.
2. Deploy search and verify all three signals above. The monolith's outbox relay must already be live:
   `NOTIFICATION_RELAY_ENABLED=true` and its `RABBITMQ_URL` must point at the same CloudAMQP broker.
   Despite its historical name, that relay also publishes all `product.*` search events.
3. During a low-traffic window, use an admin access token to enqueue the initial backfill. It shares
   the same ordered outbox relay as notification and order events, so a large catalogue can delay
   those messages until the backfill clears:

   ```bash
   BACKEND_ORIGIN="https://your-backend.onrender.com"
   curl -fsS -X POST \
     -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
     "$BACKEND_ORIGIN/api/v1/admin/products/reindex"
   ```

   The endpoint returns `202` with `data.queued`. That means outbox rows were queued; it does **not**
   mean the search consumer has finished indexing them. It inserts or refreshes every non-deleted
   product; it does not truncate DB#3 or remove an orphan left by a previously missed delete.
4. Wait until the outbox, `search_index.v2.q` and its retry queue drain, and inspect the DLQ before
   continuing. After at least one event has run, confirm
   `search_events_processed_total{result="success"}` rises, the active-product gauge stabilises, and a
   known product is returned by `/search`.
5. Set the monolith's `SEARCH_SERVICE_URL` to the search origin with no path or trailing slash, then
   set `SEARCH_SERVICE_ENABLED=true`. It uses search behind a 700 ms timeout and falls back to its
   original `ILIKE` query on network, timeout, HTTP or response-shape failures.
6. Separately set chat's `SEARCH_SERVICE_URL` to the same origin. Leaving it empty keeps the bot
   available but removes the product-search tool.

## Post-deploy smoke checks

The first request may itself wake a sleeping Free instance:

```bash
SEARCH_ORIGIN="https://your-search-service.onrender.com"
curl -fsS "$SEARCH_ORIGIN/health"
curl -fsS "$SEARCH_ORIGIN/search?q=zzzzdeploysmokezzzz&limit=1"
curl -fsS "$SEARCH_ORIGIN/search/detailed?q=zzzzdeploysmokezzzz"
curl -fsS "$SEARCH_ORIGIN/metrics"
```

The main search command must return `items`, `total`, `page` and `limit`; detailed search must return
`items` and `total`. Empty arrays are fine for that deliberately impossible term. In metrics, check at
least:

```text
process_start_time_seconds
search_index_products_total
search_events_processed_total
search_tombstone_rows_total
search_processed_events_rows_total
search_db_size_bytes
```

The labelled `search_events_processed_total` series appears only after an event has been processed;
the four gauges are present from boot.

`process_start_time_seconds` is the honest cold-start signal. A manual `/health` request always ends
with a `200` once the service is awake, because that same request caused the wake; a process start time
only seconds old shows that the probe changed the state it was trying to observe.

For an end-to-end check, update a disposable product, wait for its `product.updated` event to clear the
queue, and query its distinctive name. That proves the monolith outbox, broker binding, consumer and
DB#3 write path—not only the HTTP read path.

## Free-instance behaviour

Render spins down a Free web service after 15 minutes without inbound traffic. While search is asleep,
its RabbitMQ consumer is stopped and valid product events accumulate in the durable main queue. A
normal idle interval is safe: the process drains those events when an HTTP request wakes it, and
`processed_events` makes duplicate event ids idempotent in the same transaction as the index write.

That guarantee is intentionally bounded, not absolute. Main-queue messages expire to the DLQ after
30 days; the DLQ has its own 30-day TTL and a 10,000-message drop-head cap. Poison messages and writes
that exhaust three retries remain there for operator inspection; restarting the service does not
repair them.

Search has no scheduled cron, but application traffic can wake it:

- when `SEARCH_SERVICE_ENABLED=true`, storefront browsing starts a throttled background `/health`
  poke; a failed 700 ms search triggers another fire-and-forget poke and immediately returns to the
  `ILIKE` fallback;
- the chatbot calls `/search/detailed` directly and starts its own background poke after timeout,
  transport or `5xx` outcomes.

The two callers intentionally have different wait budgets; a failed business request need not last as
long as a manual `/health` wake. The measured timing and failure classification live in
[chat-architecture.md](chat-architecture.md#every-clock-in-one-question).

## Rollback and troubleshooting

If a release is serving bad search results, set the monolith's `SEARCH_SERVICE_ENABLED=false` first.
That restores the old catalogue query after the monolith redeploys. Clear chat's `SEARCH_SERVICE_URL`
if the bot tool must also be removed, then roll Render back to the preceding image digest or
commit-SHA tag.

Do not delete DB#3 or the production queues during a code rollback. Keeping them lets the previous
consumer catch up without dropping events.

| Symptom | Most likely check |
|---|---|
| Deploy never becomes healthy | `DATABASE_URL`, Neon SSL, embedded migration and initial DB-ping logs |
| `/health` is `200`, but no product events move | CloudAMQP consumer count on `search_index.v2.q`, credentials and a stale queue-name override |
| Consumer logs repeated `406 PRECONDITION_FAILED` | Clear the stale Render queue override, redeploy with `search_index.v2.q` and verify its consumer. Inspect or drain the old queue before retiring it; re-run the backfill if event coverage is uncertain |
| Search is valid but always empty after first deploy | Run the admin reindex, verify the relay flag, then wait for both outbox and broker queue to drain |
| CI is green, but Render still runs an older image | Verify `RENDER_DEPLOY_HOOK_SEARCH` exists and inspect the Docker job's deploy-hook step |
| `/health` is `200`, but `/search` is `500` | Check Neon availability and DB errors after startup; liveness does not re-check dependencies |

## Local development against the production broker

Prefer the local RabbitMQ container. If a local run must point at CloudAMQP production, isolate all
three durable queues with the versioned local name:

```text
SEARCH_QUEUE_NAME=search_index.v2.local.q
```

Two differently named queues bound to the same topic exchange each receive a copy of every event.
Sharing the production queue name instead makes RabbitMQ round-robin deliveries, so local and Render
each consume only part of the stream.

When finished, inspect and delete `search_index.v2.local.q`, `search_index.v2.local.q.retry` and
`search_index.v2.local.q.dlq` from CloudAMQP. All three are durable; the bound main queue keeps
accumulating new events, while retry and DLQ queues can retain leftovers.
