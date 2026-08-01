# Notification Service

A standalone **NestJS microservice** that owns the notifications domain, carved out of the
e-commerce monolith using the **strangler-fig** pattern. It consumes domain events from
RabbitMQ, persists notifications in its **own database**, and pushes them to clients in
real time across process boundaries.

This service is the capstone of the project's move from a modular monolith to a distributed
system. For the full end-to-end architecture (and how it fits with the monolith and the
frontend), see the [root README](../README.md).

---

## Why it exists

Notifications used to run in-process inside the monolith. They were extracted into this
service to demonstrate a realistic microservice boundary:

- **Database per service** — the notification service owns the source of truth (its own
  Postgres, referred to as DB#2). The monolith keeps only a lightweight read projection so
  it can render the bell/list without querying this service synchronously (**CQRS**).
- **Asynchronous integration** — the monolith never calls this service directly. It writes
  to a **transactional outbox**, a relay publishes to RabbitMQ, and this service consumes.
  Producer and consumer stay decoupled and independently deployable.
- **Zero-downtime cutover** — the extraction shipped behind a feature flag
  (`NOTIFICATION_MODE`: `inprocess` → `distributed`) so traffic could be moved gradually and
  rolled back instantly.

---

## Architecture

```
Monolith (writer)                RabbitMQ                 Notification Service (this repo)
─────────────────                ────────                 ────────────────────────────────
outbox_event  ──relay──▶  exchange: ecommerce.events  ──▶  queue: notifications.q
                                                              │
                                                              ▼
                                                     idempotent consumer
                                                     (processed_events dedup)
                                                              │
                                        ┌─────────────────────┼─────────────────────┐
                                        ▼                     ▼                     ▼
                                  own database          mail (Handlebars)    Socket.IO via
                                  (notifications)       for email events     Redis emitter
                                        │                                   (cross-process WS)
                                        ▼
                                  own outbox ──relay──▶ exchange: notifications.events
                                  (read projection back to the monolith)
```

Key mechanics:

- **Idempotent consumer** — every event id is inserted into `processed_events` in the same
  transaction as the write. A duplicate delivery hits a unique-violation (Postgres `23505`)
  and is acknowledged as already-processed, so at-least-once delivery never double-applies.
- **Retry + dead-letter** — transient failures are routed through a retry exchange
  (`notifications.dlx` / `notifications.retry`) with a poison-message dead-letter queue
  (`notifications.dlq`) instead of blocking the main queue.
- **Cross-process realtime** — the service does not hold the client WebSocket connections;
  it publishes through a **Socket.IO Redis emitter** so notifications reach clients connected
  to the monolith's gateway in another process.
- **Own outbox** — after persisting, the service emits its own events on
  `notifications.events`, which the monolith consumes to keep its read projection in sync.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | NestJS 11 (TypeScript) |
| Message broker | RabbitMQ (`amqplib`) |
| Database | PostgreSQL (`pg` + TypeORM, migrations) |
| Realtime | Socket.IO Redis emitter (`@socket.io/redis-emitter`, `redis`) |
| Email | `@nestjs-modules/mailer` + Handlebars templates |
| Scheduling | `@nestjs/schedule` |
| Metrics | `prom-client` (Prometheus pull) |
| Tracing | OpenTelemetry (OTLP HTTP exporter) |

---

## Project structure

```
src/
├─ modules/
│  ├─ broker/       RabbitMQ consumer, retry/DLQ topology, own-outbox relay,
│  │               health controller, cross-process WS emitter
│  └─ metrics/      Prometheus metrics controller + service
├─ consumer/        event → notification dispatch handlers
├─ notifications/   notification domain logic
├─ mail/            mailer + Handlebars templates
├─ entities/        Notification, ProcessedEvent, NotificationOutbox
├─ database/        TypeORM data source + migrations
├─ contracts/       generated event/payload contracts (gen-contracts)
└─ common/          shared helpers
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values. Summary of the important ones:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP port (default `3001`) — serves health + metrics |
| `RABBITMQ_URL` | Broker connection (shared instance with the monolith) |
| `REDIS_URL` | Redis for the Socket.IO emitter (cross-process WebSocket) |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Own database (DB#2) |
| `MAIL_USER` / `MAIL_PASSWORD` | SMTP credentials for email notifications |
| `FRONTEND_URL` | Base URL for deep links inside emails |
| `OTEL_ENABLED` / `OTEL_SERVICE_NAME` / `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry tracing (off by default) |

Never commit a real `.env`.

---

## Running locally

Requires a reachable RabbitMQ, Redis, and PostgreSQL (DB#2).

```bash
# install dependencies
npm install

# apply database migrations (creates notification, processed_events, notification_outbox)
npm run migration:run

# development (watch mode)
npm run start:dev

# production build + run
npm run build
npm run start:prod
```

The schema is owned by this service and built by its own migrations (`synchronize` is off);
the monolith never touches these tables.

---

## HTTP endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe |
| `GET` | `/health/broker` | RabbitMQ connection + dead-letter queue depth |
| `GET` | `/metrics` | Prometheus metrics (RED metrics + outbox lag) |

---

## Observability

The service exposes Prometheus metrics (request/consumer rates, errors, processing latency,
outbox lag) and emits OpenTelemetry traces that propagate context across the outbox time gap
and the RabbitMQ process gap.

For the full deep dive — the two pipelines (traces push vs metrics pull), trace-context
propagation, the RED metrics, and known limitations — see
[`docs/observability.md`](../docs/observability.md).
