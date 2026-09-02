# Deploying the chat service

The chat service is a Go HTTP server that streams bot replies over SSE. It is packaged as a container
image, published to GHCR by CI, and deployed on Render as a free web service — the same pipeline the
search service uses.

## Where it runs, and why not through the Blueprint

The service is deployed on a **separate Render account** from the monolith and the notification service,
for the reason spelled out in [deploy-search-service.md](deploy-search-service.md): free-tier instance
hours are metered per account, so a new account starts from its own allowance.

The repository's `render.yaml` Blueprint is **not** used here, and adding a chat block to it would be a
mistake rather than an omission. A Blueprint instance is created from the whole file: applying it on the
second account would recreate the backend and the notification service there, and the primary account
would start spinning up the chat service on its next apply. The isolation only holds while the file
describes one account's services.

## Image

CI builds `chat-service/Dockerfile` and pushes to:

```
ghcr.io/chaugiakhang193/fullstack-multi-vendor-ecommerce-chat:latest
```

The package must be **Public** so Render can pull it without registry credentials.

## Creating the service (Render dashboard)

1. New → Web Service → **Deploy an existing image**.
2. Image URL: the GHCR tag above. Region: Singapore (same as the other services).
3. Health check path: `/health` — the service has no global path prefix.
4. Set the environment variables below.
5. Settings → Deploy Hook → copy the URL into the GitHub repository secret
   `RENDER_DEPLOY_HOOK_CHAT`. The CI step that calls it already exists and exits quietly while the
   secret is unset, so nothing breaks before this step is done.

Database migrations run at boot, from files embedded in the binary. A deploy that cannot reach the
database fails at startup rather than while serving.

## Environment variables

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon DB#4 connection string | Required. Must carry `sslmode=require` |
| `JWT_ACCESS_SECRET` | identical to the monolith's | Required. A mismatch rejects every access token while the tokens themselves are perfectly valid — compare hashes, not eyes |
| `GEMINI_API_KEY` | Google AI Studio key | Empty disables the bot branch; the service still starts and serves everything else |
| `GEMINI_MODEL` | leave unset | Defaults to `gemini-3.5-flash-lite`. Set it to move models without a redeploy |
| `CHAT_BOT_ENABLED` | `true` | Kill switch. `false` answers 503 with a reason instead of calling the provider |
| `SEARCH_SERVICE_URL` | the search service's Render URL | Empty means the bot runs without registering its search tool: it can still answer, it just cannot look anything up |
| `MONOLITH_URL` | the monolith's origin, no path and no trailing slash | Required for 1-to-1 chat. Empty breaks it silently — see below. The client appends `/api/v1/seller/shops` itself, so an origin that already carries `/api/v1` produces a 404 that looks identical to the empty case |
| `FRONTEND_URL` | the storefront origin | Both the CORS allowlist and the host for product links. A trailing slash is trimmed |
| `BOT_GUEST_DAILY_LIMIT` | leave unset | Defaults to 5 questions per day, counted per IP |
| `BOT_USER_DAILY_LIMIT` | leave unset | Defaults to 30 per account |
| `BOT_USER_HOURLY_LIMIT` | leave unset | Defaults to 10 per account |
| `BOT_DAILY_GLOBAL_LIMIT` | leave unset | Defaults to 300 for the whole service — this is the number that protects the provider quota |
| `BOT_BURST_CAPACITY` | leave unset | Defaults to 10 questions back to back |
| `BOT_BURST_REFILL_SECONDS` | leave unset | Defaults to one refilled question every 6 seconds |
| `LOG_LEVEL` | `info` | |

`PORT` is injected by Render and takes precedence over `CHAT_HTTP_PORT`; neither needs setting by hand.

A malformed limit is a startup failure, not a warning: a deploy that mistypes a number would otherwise
run with the default while the person who set it believes the tighter value is in force.

**Not every key in this table fails the same way, and the quiet ones are the dangerous half.**
`DATABASE_URL` and `JWT_ACCESS_SECRET` fail loudly: the service refuses to start, or every request is
rejected. `MONOLITH_URL` and `SEARCH_SERVICE_URL` do neither. The service starts, the health check
passes, every route answers, and one feature is simply gone.

`MONOLITH_URL` was in fact left unset in production for the entire life of 1-to-1 chat, and nothing
anywhere said so — no log line, no metric, no error frame to the client. The lookup short-circuits on
an empty base URL and returns "this user owns no shop", which is a legitimate answer for most users.
A seller then joins only their `user:` room and never the `shop:` room a buyer's message is addressed
to, so messages reached the database and appeared on the next reload while never arriving live.

**Checking it in ten seconds, without deploying anything:** open the seller inbox with devtools on the
`/ws` connection and read the first frame the server sends. `ready` carries `shopId` when the lookup
succeeded and omits the field entirely when it did not — the frame is 112 bytes in the healthy case
and 64 in the broken one, so even the length column gives it away.

## Free tier behaviour

The service sleeps after 15 minutes without traffic and pulls its image again on wake, so the first
request after an idle period pays a cold start. The bot's first tool call also wakes the search service
if that one has been idle, which stacks two cold starts on one question.

Running on a single instance is what makes the burst limiter correct as written: it holds its buckets in
memory, so the ceiling is per instance. On more than one instance the real ceiling becomes the capacity
multiplied by the instance count.

The database pool is configured to keep no idle connections, which lets Neon's compute suspend while the
service is quiet. The trade is a connection setup on the first query after each idle stretch.
