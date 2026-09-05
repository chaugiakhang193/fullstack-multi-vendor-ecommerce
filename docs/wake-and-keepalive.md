# Waking and keeping alive

_Last updated: 22:24 ICT · 05/09/2026_

Four services run on Render's free instance type. A free instance sleeps after 15 minutes without
inbound traffic and takes tens of seconds to come back — observed here between 12.5 s and 43.8 s, and
Render's own documentation allows for about a minute. Two of them are kept awake by a scheduled ping;
two are configured to be woken on demand. This document is the single place where that split, and the
machinery behind it, is written down — the code for it is spread across five files in two languages
and reads as unrelated fragments unless you already know the shape.

## 1. Who stays awake, and who gets woken

| Service | Kept warm by | Why |
| :--- | :--- | :--- |
| Monolith (NestJS) | scheduled `GET /api/v1/health`, every 10 min | It is the origin for every page. A cold start here is a cold start for the whole storefront. |
| chat-service (Go) | scheduled `GET /health` on cron-job.org | It is an entry point the browser talks to directly. Asleep, the chat widget looks dead while the page waits with nothing to render. |
| search-service (Go) | **nothing — deliberate** | Search is an optimisation with a working fallback. Holding a second instance awake around the clock would spend the workspace's shared free-instance hours on a service that degrades gracefully. |
| notification-service (NestJS) | **nothing — deliberate** | Its work arrives through a durable RabbitMQ queue. During an ordinary idle interval, sleeping delays delivery without losing anything; the queue's own TTL and dead-letter caps are the outer bound on that. |

The monolith's path is not a typo. It carries a global `api/v1` prefix, so a probe aimed at `/health`
gets a `404` — which passes as "the service answered" while proving nothing. The three Go and Node
services have no prefix and answer at `/health` directly.

The two accounts matter here. Account #1's workspace runs the monolith and the notification service;
account #2's runs search and chat. Render grants **750 free instance hours per workspace per month**,
and account #2's allowance is shared between search and chat. Keeping one instance awake continuously
costs roughly 730 of those hours, so the budget only stretches to one always-on service per workspace.
That single constraint is why search is woken on demand rather than pinned awake. The per-service
deployment details are in [deploy-search-service.md](deploy-search-service.md) and
[deploy-chat-service.md](deploy-chat-service.md); the platform's own terms are in
[Render's free-instance limits](https://render.com/docs/free).

The cron itself lives outside this repository, which makes it invisible to anyone reading the code.
That is worth stating plainly: a scheduled job nobody can see is still load bearing, and it belongs on
a release checklist rather than in someone's memory.

What the schedule buys is narrower than it looks. It keeps an already-awake instance from going idle;
it is **not** a guaranteed way to bring back one that has already slept. Section 3 covers why.

The chat schedule is also **paused between 02:00 and 08:00 local time**, on purpose, to save instance
hours during the quiet part of the night. That saving is only free if the service can be woken again
in the morning, which is the assumption section 3 examines. A ten-minute interval comfortably keeps an
awake instance from going idle, but it does nothing for one that has already slept.

There is no cheap middle setting. Pinging every 30 or 45 minutes still lets the instance sleep between
pings, so every ping becomes a cold wake rather than a keep-alive — the worst of both arrangements.

## 2. Two clocks, and why they must not be confused

Everything in this document turns on the difference between the two ways the monolith touches
search-service.

| | `SearchClient` | `SearchWarmupService` |
| :--- | :--- | :--- |
| Calls | `GET /search?q=…` | `GET /health` |
| Runs on | the customer's request path | a background task, fire-and-forget |
| Waits up to | **700 ms** (`TIMEOUT_MS`) | **120 s** (`COLD_START_TIMEOUT_MS`) |
| Can it wake a sleeping instance? | **No.** A cold start takes ~12.6 s. | **Designed to** — it holds the request open long enough. Whether the wake is admitted is a separate question; see section 6. |

A shopper waiting on a search box cannot be made to wait twelve seconds, so the 700 ms budget is not
negotiable. The consequence is that the component with the shortest patience is also the one that
naturally arrives first. Section 4 is about fixing that ordering.

The same pair exists elsewhere in the system: `NsWarmupService` wakes the notification service on the
purchase funnel, and chat-service has its own `Warmer` for search, because it calls search directly
rather than through the monolith. All three share a global throttle, an in-flight guard, and a policy of
swallowing every error. They differ in persistence: the two NestJS warmers add a four-attempt retry
chain spread over 90 seconds, while chat-service makes **one** long-lived attempt and stops.

## 3. What Render does to a wake attempt

Wake attempts against a hibernating instance have come back refused, with Render naming the reason in
a header. Every refusal observed so far arrived while attempts were clustered — several within a short
window — so the trigger is not pinned down; what is certain is the label:

```
HTTP/1.1 429
x-render-routing: hibernate-rate-limited
```

Two details decide the design:

- **The label names hibernation, not traffic.** Requests to an instance that is already awake are not
  throttled. Measured on 05/09/2026: a burst of 8 storefront searches against a warm search-service
  returned 9/9 served, 0.28–0.38 s end to end.
- **There is no `Retry-After`.** Render does not say how long the refusal lasts, so nothing in the
  system can schedule around it. Anything that wants to recover has to retry and find out.

Measured wake times, each labelled by service, because the numbers are close enough to be confused:

| Service | Cold start | Measured |
| :--- | :--- | :--- |
| search-service | 13.7 s, 12.6 s | 04/09/2026, by hand |
| search-service | 12.6 s | 05/09/2026, by hand |
| chat-service | 12.5 s | before its cron existed |
| notification-service | 43.8 s | 05/09/2026, by hand |

### What the measurements ruled out

Three explanations were considered and dropped, listed here so they are not re-proposed:

- **Slow cold starts as the cause of failed calls.** A cold start is slow, but the failures under
  investigation returned in tens of milliseconds. A request that is refused never waits.
- **A general rate limit on traffic between services.** Ruled out by the warm-instance burst above:
  same source, same destination, no throttling once the target was awake. This does not rule out a
  limiter that applies *only* while the target is hibernating — that remains open.
- **Plain single-flight de-duplication**, where a wake already in progress refuses concurrent attempts.
  It does not fit the duration: a refusal arrived 91 seconds after the first attempt, with nothing else
  in flight at that moment, and far past the ~12.6 s a cold start actually takes.

What is left is an observation rather than a mechanism: a first wake attempt was followed by refusals
that outlasted a normal cold start. Whether abandoning that first attempt early creates that state,
worsens it, or merely coincides with it has not been isolated — see Known limitations.

### Wake attempts, grouped by where they came from

Every wake attempt recorded so far, with the target named — the counts are per target, since a refusal
against one service says nothing about another:

| Origin | Target | Outcome |
| :--- | :--- | :--- |
| A laptop outside Render, `curl` | search-service | woke it, 13.75 s |
| The same laptop, `User-Agent: node` | search-service | woke it, 12.69 s |
| The Render-hosted monolith | search-service | `429 hibernate-rate-limited`, 4 of 4 |
| The Render-hosted monolith | notification-service | `429 hibernate-rate-limited`, 8 across 2 chains |
| A scheduling service outside Render | chat-service | `503`, returned in 784 ms |
| A visitor's browser | chat-service | **not yet tested** |

Spoofing the client's `User-Agent` changed nothing, which rules that out as the variable. What the
table supports is narrower than it first appears:

> Requests originating outside Render have woken the service, while requests originating from the
> Render-hosted monolith have repeatedly been answered with `hibernate-rate-limited`. A
> source-sensitive admission policy is a **leading hypothesis, not an isolated result.**

Two things stop it being a conclusion. The scheduling service also sits outside Render and is refused
anyway, which an inside-versus-outside split does not explain. And the successful and refused attempts
happened on different sleep cycles, so limiter state, a pending wake, and platform conditions were
never held constant. Isolating it needs one request per sleep cycle, from one origin at a time, with
nothing else touching the service in between.

### Automated wake-up is best effort

The scheduled health checks and the background warmers are designed to keep an active instance warm, or
to give a sleeping one enough time to start. They do not guarantee that Render will admit a wake
request. On the Free instance type the edge can answer `503`, or `429 hibernate-rate-limited`, before an
application instance is ever created.

That ordering is what makes the timeout numbers misleading at first glance. A ~12.6 s cold start sits
comfortably inside a 120 s budget — but the budget only starts counting once a request has been
admitted. A refusal at the edge arrives in well under a second, long before any instance is being
built, and no client timeout can recover it. A cron ping refused in 784 ms never entered a cold start at
all; giving it a longer deadline would have changed nothing.

So a keep-alive schedule prevents an awake instance from going idle. It should not be treated as a
guaranteed recovery mechanism once the instance is already asleep.

None of this is an official Render rule. Their documentation says the next HTTP request spins a service
back up, and also says the Free tier is not intended for production; it describes neither
`hibernate-rate-limited` nor any admission guarantee. What is recorded here is an **observed Free-tier
operational constraint**, not a documented contract.

Because of that, availability never rests on a wake succeeding:

- search falls back to the in-monolith `ILIKE` query;
- notification work waits in a durable RabbitMQ queue until the consumer returns;
- the circuit breaker keeps customer traffic from adding further wake attempts.

This is a limitation the architecture absorbs on purpose, not one it failed to anticipate.

## 4. Keeping the request path off a sleeping instance

Because a 700 ms call can never wake anything, the request path should not be the thing that tries.
`SearchClient` carries a circuit breaker so that, once search is known to be unreachable, customer
traffic stops touching it and the patient background poke is left to do the waking alone.

Standard naming: **`closed` is healthy and lets calls through, `open` is blocking.**

```
open  (initial state)
  ├─ customer request → ILIKE fallback immediately, no connection opened
  └─ warmup poke returns 2xx → closed

closed
  ├─ /search succeeds → stay closed, refresh the reachability timestamp
  ├─ timeout | network | 5xx | 429 → open
  └─ reachability evidence older than 14 min → open, without trying /search
```

Three parts of that are load bearing:

**It starts open.** A freshly booted process has no evidence about search-service at all, and guessing
optimistically means opening with a 700 ms call against an instance that may be asleep. A restart is
not a way to reopen the circuit.

**Evidence expires after 14 minutes.** Render sleeps an instance after 15 minutes of quiet, so a long
enough gap between searches is itself reason to doubt. Without this, the first burst of searches after
a quiet stretch would all find the circuit closed and all go out together. This costs something real:
a request arriving at minute 14 would have found the service awake and would itself have reset the idle
timer, and instead it falls back. On a quiet storefront, the first search of each idle window is served
from the fallback. That is the price of never aborting a wake.

**A 4xx that is not 429 does not open the circuit.** A `400` or `404` means the service answered — that
is a contract or configuration problem, and silencing it behind an open circuit would hide it rather
than fix it. The same applies to a malformed body. Those outcomes are still counted as fallbacks, and
they still refresh the reachability timestamp, because answering at all proves the instance is up.

The admission check is fully synchronous and runs before any `await`. On Node's event loop that is what
stops a burst of concurrent searches from all reading a stale state and leaving together.

## 5. Reproducing it, and reading the metrics

No dashboard access is needed. Fire a burst of `?q=` requests at `/api/v1/products`, then read
`/api/v1/metrics` — the wider metric surface is described in [observability.md](observability.md):

| Series | Meaning |
| :--- | :--- |
| `search_requests_total{outcome="served"}` | the search service answered |
| `search_requests_total{outcome="fallback"}` | the request was served from `ILIKE` instead |
| `search_fallback_total{reason="circuit_open"}` | the circuit was open, so no call was made |
| `search_fallback_total{reason="http_4xx"}` | a call went out and came back 4xx — **any** 4xx |

A healthy pattern after a quiet stretch is a small number of `circuit_open` entries followed by
`served` climbing again — the breaker held the request path back while the background poke did its
work. `circuit_open` rising with no `served` behind it means the poke is not getting through, and that
is the signal to look at.

Observed on 05/09/2026, against a sleeping instance: ten searches in a row recorded `circuit_open`
with `http_4xx` and `timeout` both at zero — the request path made no network calls at all. Once the
instance was awake, the next search recorded one more `circuit_open`, its background poke was admitted,
and the five searches after it were `served`. The recovery path closes in a single request, provided a
wake gets through.

**These series cannot, on their own, prove a wake was refused.** `http_4xx` lumps `400`, `401`, `403`
and `404` together with `429`, so a configuration mistake and a refused wake are indistinguishable
here. Confirming `hibernate-rate-limited` means reading the log line, which carries the edge headers
alongside the status. Splitting `429` into its own reason would close that gap and has not been done
yet.

To tell whether a service is actually being kept awake, `curl /health` is not the test — that request
wakes the service it is measuring. Read `process_start_time_seconds` from `/metrics` after leaving the
service alone for twenty minutes. A process older than the idle window means something is holding it
up; one that has just booted means your own request did the waking.

## 6. Known limitations

**The trigger for the refusal window is not isolated.** The leading hypothesis is that a wake attempt
abandoned after 700 ms is what arms it, but the evidence is circumstantial: the first attempt timed out
and the refusals began within a second. Separating cause from coincidence needs a controlled test —
one long request left open, a second sent one second later, each branch on its own idle cycle, since
the measuring request can itself change the state being measured.

**One observation still does not fit.** On 05/09/2026 a hand-run `curl` returned `200` at 05:33 and the
monolith was refused a minute later, which a hibernation-only explanation does not account for. It is
recorded as a counter-example rather than explained away; resolving it needs origin access logs
correlated by `CF-Ray`.

**The background poke has no backoff.** Its retry chain is a fixed four attempts across 90 seconds, and
a chain that fails does not lock the throttle, so ordinary traffic can start a fresh chain immediately
after the previous one gives up. Under steady traffic against a sleeping instance that works out to an
upper bound of roughly 160 wake attempts an hour — a figure that only holds when each attempt is
refused almost immediately. If the attempts instead hang for their full 120 s budget, the real rate is
far lower. The circuit breaker in section 4 removes the customer-path attempts but does not touch this
number; an exponential backoff with jitter between failed chains is the planned follow-up.

**Nothing here guarantees an automated wake succeeds** — see *Automated wake-up is best effort* in
section 3. The breaker stops the system from working against itself; it cannot make the edge admit a
request. Whether a scheduled or programmatic `GET /health` is admitted as readily as a hand-run one
remains the open case, and the cron incident on 04/09/2026 is the evidence sitting on it.
