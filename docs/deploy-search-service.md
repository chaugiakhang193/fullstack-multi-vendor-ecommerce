# Deploying the search service

The search service is a Go consumer + HTTP server. It is packaged as a container image, published
to GHCR by CI, and deployed on Render as a free web service.

## Deployment isolation per service

Each service in this system is deployed independently, so the search service gets its own hosting
target rather than being co-located with the monolith and the notification service. Keeping the
newest service on a separate deployment boundary means its resource envelope, restarts and rollouts
never contend with the two services already running in production, and it doubles as an early check
that the packaging pipeline (GHCR image → managed host → health check) works end to end on a clean
environment before it matters.

> **Capacity note:** on Render's free tier, instance hours are metered per account, so a dedicated
> account for this service starts from its own fresh allowance and its usage stays independent of
> the other two services. The isolation is therefore free of resource trade-offs; if a future host
> meters differently, the same image deploys unchanged to any container platform (e.g. Cloud Run).

## Image

CI builds `search-service/Dockerfile` and pushes to:

```
ghcr.io/chaugiakhang193/fullstack-multi-vendor-ecommerce-search:latest
```

The package must be **Public** so that Render can pull it without registry credentials, the same
arrangement the backend and notification images already use.

## Creating the service (Render dashboard)

The repository's `render.yaml` Blueprint is intentionally **not** used for this service. A Blueprint
instance is created from the whole file, so applying it on a separate account would also recreate
the backend and the notification service there, and adding a search block to it would make the
primary account spin the search service up as well — collapsing the very isolation this setup is
meant to keep.

1. New → Web Service → **Deploy an existing image**.
2. Image URL: the GHCR tag above. Region: Singapore (same as the other services).
3. Health check path: `/health` — the service has no global path prefix.
4. Set the environment variables below.
5. Settings → Deploy Hook → copy the URL into the GitHub repository secret
   `RENDER_DEPLOY_HOOK_SEARCH`, so CI redeploys on every push to `main`.

## Environment variables

| Key | Value | Notes |
|---|---|---|
| `RABBITMQ_URL` | CloudAMQP connection string | Shared broker with the monolith |
| `DATABASE_URL` | Neon DB#3 connection string | Must carry `sslmode=require` |
| `SEARCH_QUEUE_NAME` | leave unset | Defaults to `search_index.q` |
| `LOG_LEVEL` | `info` | |

`PORT` is injected by Render and takes precedence over `SEARCH_HTTP_PORT`; neither needs to be set
by hand.

## Local development against the shared broker

If a local run points at the production broker, set a distinct queue name:

```
SEARCH_QUEUE_NAME=search_index.local.q
```

Two queues bound to the same topic exchange each receive their own copy of every message. Sharing
one queue name instead makes RabbitMQ round-robin the deliveries, so the local process and the
deployed one would each consume roughly half the events. Delete the local queue when finished —
it is durable, so it keeps accumulating messages with nothing draining it.

## Free tier behaviour

The instance sleeps after 15 minutes without HTTP traffic, which also stops the consumer. Events
queue up in RabbitMQ meanwhile and are drained once the instance wakes; the outbox is at-least-once
and `processed_events` makes reprocessing idempotent, so nothing is lost or double-applied. Keeping
the instance warm with a cron ping is deferred — it consumes instance hours, and the catch-up
behaviour is worth demonstrating as it is.
