# Deploying the notification service

_Last updated: 11:13 ICT · 05/09/2026_

The notification service is a NestJS RabbitMQ consumer packaged as a Render web service. It writes
the authoritative notification rows to its own Supabase DB#2, emits realtime Socket.IO events through
the Redis adapter, and publishes `notification.created` back to the monolith so DB#1 can maintain the
`notification_read` projection used by the bell and notification APIs.

This is the operational runbook for creating, releasing, verifying and rolling back that service.
The architecture deep-dive is maintained separately.

## Where it runs

The service runs in account #1's Render workspace beside the monolith. It is declared in the
repository's `render.yaml` as the Blueprint-managed Free web service
`fullstack-multi-vendor-ecommerce-notification`, in the Singapore region, with `/health` as its health
check path.

Render's Free plan has no background-worker service type, so this consumer must also listen on the
injected HTTP `PORT`. That small HTTP surface is intentional: it gives Render a liveness probe and
gives the monolith a URL it can poke when the service has spun down.

## Image and release path

CI builds `notification-service/Dockerfile` and publishes:

```text
ghcr.io/chaugiakhang193/fullstack-multi-vendor-ecommerce-notification:latest
```

It also publishes a commit-SHA tag. On a push to `main`, the Docker job runs after the repository build
job succeeds, pushes the image, then calls the notification deploy hook if the GitHub secret
`RENDER_DEPLOY_HOOK_NOTIFICATION` exists. An unset hook is deliberately a successful no-op, so green
CI does not by itself prove that Render pulled the new image.

The Docker job has no path filter. A docs-only push still rebuilds the four service images and calls
all configured deploy hooks; batch documentation edits when an unnecessary production restart would
be disruptive.

Do not override the image command in Render. The image starts with:

```text
npm run migration:run:prod && node dist/main
```

Migrations therefore run before the application opens its port. A DB credential, SSL or migration
failure is a hard startup failure; RabbitMQ and Redis failures are not.

## Environment variables

| Key | Production value | Behaviour |
|---|---|---|
| `NODE_ENV` | `production` | Required for SSL to Supabase; another value disables DB SSL |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Supabase DB#2 credentials | Required. DB#2 is the notification source of truth, not the monolith database |
| `RABBITMQ_URL` | CloudAMQP URL shared with the monolith | Operationally required. Missing or unreachable RabbitMQ leaves HTTP healthy but no notification events are consumed or projected |
| `REDIS_URL` | the same Redis instance used by the monolith Socket.IO adapter | Operationally required for realtime. Missing or down Redis does not block DB writes or message acknowledgements; live toasts and badge updates are lost until a later API read |
| `BREVO_API_KEY` | Brevo API key | Required for payout and product-moderation emails; email failure is best-effort and does not roll back notification processing |
| `MAIL_FROM_EMAIL` | verified Brevo sender address | Sender used by the Brevo HTTP transport |
| `MAIL_FROM_NAME` | display name | Optional; defaults to `Giang Kha Shop` |
| `FRONTEND_URL` | storefront origin, without a trailing slash | Used to build product links in moderation emails |
| `OTEL_ENABLED` | `false` unless traces have a destination | Opt-in OpenTelemetry switch |
| `OTEL_SERVICE_NAME` | leave unset | Defaults to `notification-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP traces endpoint | Defaults locally to `http://localhost:4318/v1/traces` |

Render injects `PORT`; do not set it manually. Local runs fall back to `3001`.

There is a known configuration drift at the time this runbook was written: `render.yaml` and
`notification-service/.env.example` still name `MAIL_USER` and `MAIL_PASSWORD`, but the current
runtime does not read either key. It sends through the Brevo HTTP API and reads `BREVO_API_KEY`,
`MAIL_FROM_EMAIL` and `MAIL_FROM_NAME`; the Blueprint also omits `FRONTEND_URL`. Before applying the
Blueprint, compare the Render dashboard against the runtime keys above. Copying only the stale pair
produces a healthy service whose emails fail at send time while its health endpoints remain green.

The monolith has two matching settings:

| Monolith key | Production value | Purpose |
|---|---|---|
| `NOTIFICATION_RELAY_ENABLED` | `true` | Drains the shared DB#1 outbox to `ecommerce.events`. Despite its historical name, the same relay also carries `product.*` events for search |
| `NOTIFICATION_SERVICE_URL` | notification-service origin, without a path or trailing slash | Lets the monolith poke `/health` after publishing events and during purchase-funnel warm-up |

Do not treat `NOTIFICATION_RELAY_ENABLED` as a notification-only rollback switch. Turning it off also
stops search indexing events because notification and search share the same monolith outbox relay.

## Dependency and health semantics

`GET /health` always returns process liveness:

```json
{"status":"ok"}
```

It intentionally does not inspect Postgres, RabbitMQ or Redis. Render and the monolith warm-up path
must be able to receive `200` while a soft dependency is recovering.

`GET /health/broker` pings the two soft dependencies concurrently and returns HTTP `200` with their
states in the body:

```json
{"rabbitmq":"up","redis":"up"}
```

Treat either `down` value as a failed dependency check even though the status code remains `200`.
Postgres has no post-start health endpoint, so prove it through a real consumed event or DB query.

There are two similar-looking startup logs with different meanings:

- `[NotificationService] consumer online` is emitted after Nest starts listening. It proves only that
  the HTTP process booted.
- `[RabbitMqService] Consumer online — queue=notifications.q.` is emitted only after the exchange,
  queues, bindings and RabbitMQ consumer have been established. This is the log required for release
  acceptance.

RabbitMQ reconnects after failures using a 1 / 2 / 5 / 10 / 30-second base ladder with ±20% jitter.
Redis connects asynchronously and remains best-effort. A service can therefore move from a false-green
HTTP-only state to fully operational without another deploy.

## Queue topology operators must see

The consumer declares this durable topology:

| Name | Role | Important property |
|---|---|---|
| `ecommerce.events` | monolith → notification topic exchange | `notifications.q` binds `order.*`, `review.*`, `payout.*`, `return.*`, `shop.*` and exact `product.moderated` |
| `notifications.q` | main consumer queue | Durable, argument-free, prefetch 10 |
| `notifications.dlx` | retry/DLQ direct exchange | Application publishes failures here |
| `notifications.retry` | delayed retry queue | 30-second TTL, then dead-letters back to `notifications.q` |
| `notifications.dlq` | parking lot | Durable, no consumer; poison payloads and events exhausted after five retries remain for inspection |
| `notifications.events` | notification → monolith topic exchange | Carries exact routing key `notification.created` |
| `notification_read.q` | monolith projection queue | Durable, exact `notification.created` binding, prefetch 10 |

The service records the incoming `eventId` in `processed_events` in the same DB transaction as the
notification write. Redelivery is therefore idempotent. After commit it emits WebSocket messages on a
best-effort basis, acknowledges the incoming event, and asynchronously relays a `notification.created`
outbox row back to the monolith. The release check must cover both directions of that loop.

The return projection is intentionally thinner than the main notification consumer: an invalid
envelope is acknowledged and dropped, while another projection error is requeued once and then
acknowledged after the redelivery fails. It has no projection DLQ. Treat its error logs as data-loss
alerts for DB#1's read model and rebuild the missing row from DB#2 rather than replaying blindly.

## First deployment and cutover

The current production system has already passed the one-time migration from monolith-owned
notifications: DB#2 is the source of truth and DB#1's `notification_read` is a read projection. Do not
repeat the historical data copy and do not point new notification writes back at DB#1.

For a fresh environment or a rebuild of the service:

1. Provision DB#2 and the shared RabbitMQ and Redis credentials. Confirm DB#1 and DB#2 are different
   databases before continuing.
2. Deploy or sync the Blueprint with `NOTIFICATION_RELAY_ENABLED=false` on the monolith while the new
   environment is empty. This prevents business events from arriving before the consumer is proven.
3. Verify the migration logs, `/health`, `/health/broker`, the exact RabbitMQ consumer log and the queue
   topology above.
4. Verify the monolith has a consumer on `notification_read.q` before allowing the notification
   service to publish projections. The expected monolith log is
   `[RabbitMqService] Consumer online — queue=notification_read.q.`
5. Set `NOTIFICATION_SERVICE_URL` and then enable `NOTIFICATION_RELAY_ENABLED=true` on the monolith.
   Remember that this activates both notification and search events.
6. Run the two-way end-to-end check below. Only then accept the cutover.

For an ordinary code release to the already-cut-over production system, do not toggle the relay.
Deploy the new compatible image while `notifications.q` buffers events during the restart, then verify
that both consumers return and the queues drain.

## Post-deploy smoke checks

The first request may itself wake a sleeping Free instance:

```bash
NOTIFICATION_ORIGIN="https://your-notification-service.onrender.com"
curl -fsS "$NOTIFICATION_ORIGIN/health"
curl -fsS "$NOTIFICATION_ORIGIN/health/broker"
curl -fsS "$NOTIFICATION_ORIGIN/metrics"
```

After `/health/broker` reports both dependencies `up`, check CloudAMQP:

1. `notifications.q` has exactly one production notification-service consumer.
2. `notification_read.q` has a monolith consumer.
3. `notifications.retry` drains after its 30-second delay and `notifications.dlq` is not growing.
4. The main queue drains after the service wakes; a zero consumer count is not healthy even when
   `/health` says `ok`.

In `/metrics`, check at least:

```text
process_start_time_seconds
notification_events_processed_total
notification_event_processing_duration_seconds
notification_dlq_messages
notification_outbox_oldest_unpublished_age_seconds
```

The labelled counter and histogram appear only after an event has been handled. The DLQ and outbox
gauges refresh every ten seconds; do not read them immediately after boot and call a missing change a
failure.

For the two-way end-to-end check, trigger one legitimate event with a dedicated test account in a
safe environment—for example a disposable order or review—and record its event id. Then verify:

1. DB#1's `outbox_event.published_at` becomes non-null for that event.
2. `notifications.q` returns to its baseline and DB#2 has the event id in `processed_events` plus the
   expected row in `notification`.
3. DB#2's matching `notification_outbox.published_at` becomes non-null.
4. DB#1's `notification_read` contains the same notification id.
5. With the recipient connected, the expected Socket.IO toast or badge update arrives without a page
   reload.

Steps 1–4 prove durable delivery in both directions. Step 5 separately proves that both processes use
the same Redis instance; a passed database check does not imply realtime is wired correctly.

Do not create or cancel a real customer order solely as a production smoke test. In production,
correlate the next authorised test-account or organic event and avoid changing money or fulfilment
state for diagnostics.

## Free-instance behaviour and warm-up

A sleeping Free instance has no RabbitMQ consumer. Valid events remain in durable `notifications.q`
until the process wakes; RabbitMQ traffic alone does not wake a Render web service.

The monolith compensates by sending a fire-and-forget `GET /health` after it publishes at least one
outbox event, and earlier at selected purchase-funnel steps. A successful `2xx` poke is throttled for
ten minutes. A failed chain tries up to four times, with 15 / 30 / 45-second delays and a 120-second
timeout per request; failures never block the user's request, and the durable broker message remains
the source of recovery.

Because `/health` is itself the wake request, seeing `200` after a long wait does not prove the service
was already awake. Use `process_start_time_seconds`, the warm-up elapsed-time log and CloudAMQP's
consumer timeline to distinguish an existing process from a cold start.

## Rollback

Prefer an image rollback, not a data-path rollback:

1. Select the preceding commit-SHA image tag or digest in Render.
2. Keep DB#2, `notifications.q`, `notifications.retry`, `notifications.dlq`, `notifications.events`
   and `notification_read.q` intact.
3. Roll back only to a revision whose migrations and generated event contracts are compatible with
   the current schema and queued messages.
4. Verify both consumer logs, both broker states and the two-way loop again.

Do not run `migration:revert` as part of an application rollback. The product-moderation enum migration
has a deliberate no-op `down`, and older code may not understand newer queued contracts even if the
schema command appears to succeed.

Do not switch notification writes back to DB#1: the legacy in-process worker and `NOTIFICATION_MODE`
were removed after cutover. Also do not disable `NOTIFICATION_RELAY_ENABLED` merely to roll back this
service; that pauses search indexing too. If a bad consumer is corrupting data, stop or roll back the
notification service itself. Durable main-queue messages will wait while the correct image returns.

## Troubleshooting

| Symptom | Most likely check |
|---|---|
| Deploy never opens `/health` | DB#2 credentials, `NODE_ENV=production`, Supabase SSL and migration logs |
| `/health` is `200`, but no notifications move | `/health/broker`, the exact `RabbitMqService` consumer log and CloudAMQP consumer count on `notifications.q` |
| RabbitMQ is `down` but Redis is `up` | `RABBITMQ_URL`, CloudAMQP availability and reconnect logs; HTTP liveness is expected to remain green |
| DB notification exists, but no live toast arrives | `REDIS_URL` must be identical on both services; check Redis connection logs and Socket.IO room membership |
| DB#2 grows, but the bell/API does not show the row | Consumer count and logs for `notification_read.q`, then unpublished age in DB#2 `notification_outbox` |
| `notification_outbox` rows stay unpublished | RabbitMQ publish-confirm errors and the exact `notification.created` binding on `notification_read.q` |
| `notifications.dlq` grows | Inspect payload and event type before replay; poison messages retrying blindly only recreates the alert |
| Payout/moderation notification exists, but email is absent | `BREVO_API_KEY`, verified `MAIL_FROM_EMAIL`, Brevo response logs and the known stale `MAIL_USER`/`MAIL_PASSWORD` Blueprint keys |
| CI is green, but Render runs an old image | Confirm `RENDER_DEPLOY_HOOK_NOTIFICATION` exists and inspect the notification deploy-hook step |

## Local development safety

Use the repository's local RabbitMQ, Redis and Postgres setup. Never start a local notification service
against the production `RABBITMQ_URL`: `notifications.q` is hard-coded, so the local process becomes a
competing consumer and steals real events from Render. Unlike search, notification currently has no
queue-name override for isolating a local consumer.

The migration CLI blocks a remote DB when `NODE_ENV` is not `production`. A deliberate remote migration
requires the exact override `ALLOW_REMOTE_MIGRATION=YES_I_AM_SURE`; do not set that in a persistent
shell profile or `.env`.

Before shipping a change to notification contracts, run from `notification-service/`:

```bash
npm run gen-contracts
npm run build
git diff --exit-code -- src/contracts/*.generated.ts
```

Generated contracts are copied from their monolith sources and must not be edited by hand. The CI drift
gate repeats this check, but finding drift before the image build avoids a release that never reaches
Render.
