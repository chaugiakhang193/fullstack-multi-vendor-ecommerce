# Chat service: the shopping bot

The chat service answers product questions by streaming a Gemini reply over SSE, with one tool the model
may call to search the catalogue. Everything above the provider — retry, circuit breaker, quota, cache,
persistence — is written without knowing which model is behind it.

This note has two halves. The first follows a question through the service: the gates it passes before a
token is ever spent, how identity and quota are decided, and how the answer comes back. The second is the
provider boundary itself — what the Gemini 3 line requires of a caller, and why the code carries a field it
never reads.

## A question's path through the service

`botHandler` (`internal/httpapi`) runs a fixed sequence of gates, and the order is deliberate — each one is
cheaper than the next, so a rejected request is turned away before it costs anything it did not have to:

```
kill switch → auth → burst → read body → cache (Reserve) → quota → model
```

```mermaid
flowchart TD
  Q[POST /chat/bot] --> K{bot enabled?}
  K -- no --> R1[503 bot_disabled]
  K -- yes --> A{valid token<br/>or guest key?}
  A -- no --> R2[401 unauthorized]
  A -- yes --> B{burst bucket<br/>has a token?}
  B -- no --> R3[429 burst]
  B -- yes --> C{answer in<br/>reply cache?}
  C -- hit --> RC[Reserve — no charge,<br/>stream cached reply]
  C -- miss --> D{quota:<br/>hour · day · global?}
  D -- over --> R4[429 guest / user / global]
  D -- under --> M[call model, stream answer]
```

The kill switch (`CHAT_BOT_ENABLED`) and auth come first because they need no state and no I/O. Burst is a
pure in-memory check, so it fences off a runaway loop before that loop can touch the database. Only after
the body is read and the cache is missed does the request reach the counters that write to Neon. `Reserve`
on the cache-hit branch and `Acquire` on the miss branch return the same `Decision` shape, so the handler
has one rejection path to format, not two.

Each layer in one view — ordered by the path, cheapest first, so the columns read as "how much did this
request cost before it was turned away":

| Layer | Function | State lives in | Check cost | What it spares | Rejects with |
|---|---|---|---|---|---|
| Kill switch | `botDeps.Enabled` | config flag (RAM) | none | a provider call while the bot is off | `503 bot_disabled` |
| Auth | `resolveSubject` | stateless — HS256 verify / guest UUID | one signature check | — (identifies, does not spare) | `401 unauthorized` |
| Burst | `quota.Burst.Allow` | token bucket in RAM, per subject (cap 10, +1 / 6s; swept every 256 calls) | in-memory, no I/O | a runaway loop before it reaches the DB | `429 burst` |
| Reply cache | `bot.ReplyCache.Get` | TTL map in RAM (500 entries, 10 min) | map lookup | the model call **and** the quota charge, for a repeated question | hit streams the cached reply |
| In-flight latch | `Limiter.enter` | set in RAM, per subject-day | in-memory | concurrent tabs each spending a turn | `429 in_flight` |
| Quota counters | `Limiter.charge` | Neon `bot_usage_daily` | 1–3 DB increments | the provider's daily quota (guest 5 · user 30/hr-cap 10 · global 300) | `429 guest_daily / user_hourly / user_daily / global_daily` |
| Retrier | `bot.Retrier` | stateless | — (one retry on upstream/timeout) | — (spends a call to save an answer) | passes the error through |
| Breaker | `bot.Breaker` | state + fail count in RAM (5 consecutive failures → open 60s) | in-memory | repeated calls to a provider that is down | `503 bot_unavailable` |

The first six are gates on the request path, run in sequence. The last two are not gates — they wrap the
provider call itself, and the model loop below explains why they nest in that order.

Two of these behave in a way the row cannot hold. The cache **never evicts to make room**: when it is full
it sweeps expired entries, and if it is still full it simply skips storing the new reply. A full cache means
the questions are all different, which is exactly when a cache has stopped paying for itself — so the code
declines to add an eviction policy it would not benefit from. And the breaker counts *consecutive* failures:
one success in between resets the count to zero, so a provider that is merely flaky never trips it.

Every counter and bucket in the table lives in **RAM on one instance**. That is what makes the burst ceiling
and the in-flight latch exact — and it is also the assumption that breaks first if the service is ever
scaled to two instances, where the real ceiling becomes the configured one multiplied by the instance count.

## Quota is three ceilings and a speed limit

Burst is a token bucket held per subject in RAM (`quota.Burst.Allow`): a fixed capacity refilled one token
every few seconds. It is the speed limit, and it answers without a round trip, which is the point — the
request it blocks never reaches the database.

Those per-subject buckets accumulate, so they have to be cleaned up, and *how* is a deliberate choice. The
sweep runs **on call count, not on a timer**: every 256th `Allow` drops the buckets that have been idle long
enough, inline, while the caller already holds the lock. There is no background goroutine and no ticker —
one more goroutine is one more thing to shut down correctly, and the map only grows while requests are
arriving, so tying the cleanup to request volume means it happens exactly when it is needed and never while
the service is quiet.

The idle threshold is not a tuned constant either: it is `capacity × refill`, the time a bucket takes to
refill from empty. Past that point a remembered bucket and a fresh one are indistinguishable, so dropping it
costs nothing. It is not a memory-versus-accuracy trade — beyond that horizon there is no accuracy left to
trade away.

The three counters live in `quota.Limiter.charge`, and their order is a security decision, not a tidy
sort:

- **Individual before global.** Guest-daily or the user's hour/day counter is charged first; the global
  daily ceiling last. Reversed, someone already out of their own allowance could still add to the 300-per-day
  global total and starve the bot for everyone else.
- **Hour before day, for signed-in users.** Reversed, a user who hits the hourly wall would still have spent
  one of their daily allowance on the request that got refused.

Two guards sit around the counters. An **in-flight** latch (`Limiter.enter`, keyed per subject-day) admits
one request at a time, so opening twenty tabs blocks nineteen at the latch and none of them spends a turn.
And the counters are **fail-closed**: a database error refuses the request rather than waving it through,
because a service that cannot count cannot know how much of the provider quota is already gone — and if the
counter write failed, the conversation write would fail too.

Every rejection carries a `Reason` and a `RetryAfter` the limiter already computed (`untilNextDay`,
`untilNextHour`), so the six distinct 429s reach the client as six distinct messages rather than one flat
"out of quota".

## Identity answers two different questions

`resolveSubject` (`internal/httpapi`) is the only place a caller's identity is decided, and its signature
gives away the design: it returns **three** values, `(Subject, guestKey, error)`. The guest key is
deliberately *not* a field of `Subject`, because the two answer different questions.

**`Subject` answers "who is billed".** It is assembled on the server and holds two fields:

```go
type Subject struct {
    UserID string // empty means guest
    IP     string
}
```

`dayKey()` turns that into `user:<id>` for a signed-in caller and `ip:<addr>` for a guest. Metering guests
by IP rather than by their guest key is the load-bearing choice: a key lives in `localStorage`, so counting
against it would mean clearing site data buys five fresh turns. The IP is never taken from the request
body — it is derived server-side by `ClientIP`, reading Cloudflare's `cf-connecting-ip`, because a
client-declared address would make the guest ceiling decorative.

**The guest key answers "whose conversation is this".** It arrives as the `X-Guest-Key` header, and it is
what `EnsureBotConversation` stores as the owner of an anonymous thread. For a signed-in caller it comes
back empty — the conversation belongs to the account instead.

So an anonymous visitor is *rate-limited by IP* while their *history is addressed by key*. Two office
workers behind one NAT share a quota but never see each other's threads; clearing storage loses the thread
but grants no extra turns.

Three details around that:

- **The key travels in a header, not the body.** Identity has to be settled before the body is read, so
  that quota can reject a request whose body is garbage.
- **A bad token is a `401`, never a silent demotion to guest.** A signed-in user quietly dropped to five
  IP-based turns a day is a symptom nobody can diagnose; the status code tells the client to refresh and
  retry.
- **`IP` is filled even for signed-in callers**, though `dayKey()` ignores it there. `ClientIP` has already
  run, so carrying it costs nothing, and it is the only lead left if one account has to be traced for
  abuse. The `quota` package deliberately keeps IP out of its logs, so any future use of that field has to
  be a conscious choice rather than an accident.

That guest key started as a way to keep one anonymous visitor's model context separate from another's.
Once `GET /chat/history` existed it became something stronger: guessing a key now *reads* that visitor's
stored conversation. The key is still a 122-bit `crypto.randomUUID()`, so the difficulty is unchanged —
but the comment in `subject.go` that once called it low-stakes had to be corrected, because it now guards
a read. The validator enforces a 16–64 character bound and an alphanumeric-plus-`-_` charset before the
value ever reaches the `owner_guest_key` column.

### Where a Subject travels, and where it stops

`Subject` is not a general-purpose user context passed around the service. It reaches exactly two places,
and the list is short enough to be worth stating in full:

| Destination | Call | Why it needs identity |
|---|---|---|
| Rate limiting | `Burst.Allow(subject)` | which bucket to spend a token from |
| Quota counters | `Limiter.Reserve` / `Acquire(ctx, subject)` | which row of `bot_usage_daily` to increment |
| Conversation ownership | `conversationFor(...)` | which thread to append to |

At the third one it is taken apart rather than passed on:

```go
owner := store.BotOwner{UserID: subject.UserID, GuestKey: guestKey}
```

Only `UserID` survives, recombined with the guest key into a different type. This is the same split as
above, expressed in the type system: `Subject` is a *metering* identity, `BotOwner` is an *ownership*
identity, and neither is substitutable for the other.

The boundary that matters most is where `Subject` does **not** go: it never enters `internal/bot`. The
prompt builder, the tool loop, the retrier, the breaker and the provider client are all written without
any notion of who is asking — they receive a question and a history, nothing more.

That buys three things. Caller identity cannot leak into a prompt sent to Google, because the layer that
builds prompts has never seen it. Changing how callers are metered — say, adding a paid tier — touches
`internal/quota` and stops there. And the model layer stays honestly testable: there is no user to
construct in order to exercise it.

Counters keyed by subject, meanwhile, are plain strings rather than columns:

| Tier | Key |
|---|---|
| Guest, per day | `ip:1.2.3.4` |
| Signed-in, per hour | `userhour:<uuid>:14` — the hour, in `Asia/Ho_Chi_Minh` |
| Signed-in, per day | `user:<uuid>` |
| Whole service, per day | `global` — no prefix, because it identifies nobody |

The hour is folded into the key instead of getting a column of its own: the primary key of
`bot_usage_daily` is `(subject_key, usage_date)`, the date half already carries the day, so two digits of
hour in the key are enough to separate the buckets. One table serves all four tiers.

## The stream is the only channel

Both branches answer over SSE, never a plain JSON body. A question is a request-and-response, not a
conversation, so a WebSocket would buy nothing and cost a connection lifecycle; SSE is one-directional and
rides ordinary HTTP. `internal/httpapi/sse.go` emits a fixed event vocabulary:

| Event | Payload | Meaning |
|---|---|---|
| `meta` | `{"remaining": n}` or `{"cached": true}` | sent first, before any text |
| `tool` | `{"name": "search_products"}` | the model asked to search |
| `text` | `{"v": "…"}` | one chunk of the answer |
| `done` | `{"cached", "truncated"}` | the stream is complete |
| `error` | `{"reason": "…"}` | failed after the stream opened |

The cache-hit branch streams too, one `text` event carrying the whole stored reply, so the client has a
single code path to read. Errors split at the stream boundary: a rejection *before* the first byte is a
normal HTTP status with a JSON body the client can read; a failure *after* the stream is open can only be
an `error` event, because the status line is already sent.

## The model loop, and the ring around it

`Service.Ask` (`internal/bot`) turns one question into at most two model calls. History is trimmed to the
last `maxHistoryTurns` (6) before the question is appended, so an old conversation cannot grow the prompt
without bound.

Turn one is non-streaming and carries the tool declaration, but its sink is wrapped in `toolCallOnly` — only
a `tool` event reaches the client, and any prose the model writes on this turn is suppressed. The turn
exists to decide one thing: does the model want to search?

- **No tool call.** The answer is already complete on turn one. It is flushed once through the sink and the
  service stops. Calling the model a second time just to obtain a stream would pay twice for the same
  answer.
- **A tool call.** Only the first is run (`decided.ToolCalls[0]`); a model that asks to search several times
  in one turn cannot burn several search calls on one question. The tool result is appended and turn two
  streams the real answer. The two turns must stay adjacent — Gemini rejects the request if the
  `functionResponse` does not immediately follow its `functionCall`, which is the signature contract
  described below.

The whole of `Ask` runs under an `answerBudget` timeout, with a tighter `decideBudget` around turn one, so a
slow provider fails on a deadline rather than holding the stream open.

Around the provider sits a two-layer ring, composed in `buildBotClient` as `Breaker(Retrier(Gemini))`:

- **Retrier** retries a failed call once, on `ErrUpstream` / `ErrTimeout` only, after a jittered backoff. A
  call that already delivered bytes is not retried — that would double the visible text.
- **Breaker** sits *outside* the retrier, on purpose. Both attempts of one request count as a single failure
  toward its threshold, and while the breaker is open it short-circuits before the retrier's wait, so a
  provider that is down stops costing latency as well as calls.

The reply cache is deliberately *not* in this ring. It is a handler gate checked before quota (see the path
above), so a repeated question is answered from memory without reaching the model or spending a turn — the
ring protects the call, the cache avoids it.

## The search tool, and links built from our own slugs

When the model asks to search, `SearchTool` calls the search service at `GET /search/detailed` and hands
the results back as the tool response. The two-round protocol that this requires — and the signature Gemini
attaches to the call — is the subject of the provider half below.

One detail lives on this side of the boundary. Product links in the answer are built by `productURL` from
our own stored slug and id, `FRONTEND_URL + "/products/" + slug + "-i." + id`, never from a URL the model
composed. The storefront route resolves on the id after `-i.`, so a link works even when the slug has lost
its diacritics; letting the model write the URL would invite a plausible-looking link to a product that
does not exist.

## Conversation is stored once, and read without cost

The database is the single copy of a conversation. `EnsureBotConversation` (`internal/store`) attaches
every turn to a conversation owned by the subject, and `GET /chat/history` reads it back when the panel
first opens.

Two decisions keep that read cheap. History **does not touch quota** — it is a handful of SELECTs that never
call the model, so re-opening the widget to read yesterday's thread costs nothing. And its `limit` is a
server-side constant of 30, not a query parameter: a client-set limit would be a handle for anyone to make
the service read the whole table. `GET /chat/config` is cheaper still — it returns `{"enabled": bool}`
without a database call, because the widget mounts on every storefront page and must not bill a query just
to decide whether to draw a button.

## The bot is not a separate system, it is a kind of participant

One `message` table carries both the bot thread and the one-to-one threads between a shopper and a shop.
That is possible because a message does not point at a person. It points at a `participant` row — a
person's *seat in one conversation* — and that row is where identity lives:

| Sender | `user_id` | `guest_key` | `role` |
| :--- | :--- | :--- | :--- |
| Signed-in shopper | set | — | `user` |
| Shop owner | set | — | `seller` |
| Visitor who never signed in | — | set | `user` |
| The bot | — | — | `bot` |

Two of those four have no user id at all, and `message.sender_participant_id` is `NOT NULL`. Pointing
messages directly at a user id would mean a nullable column, a `CHECK` explaining which identity column is
in play, and that branch repeated in every query that reads a thread. Behind a participant id, all four
look identical to the reader.

The seat, not the person, is also the right grain for the columns that hang off it. `role` differs per
conversation — the same account is a `user` in the threads it opened and a `seller` in the threads its shop
receives. `last_read_at` is per conversation by definition. Neither belongs on an account.

The natural key here would be `(conversation_id, user_id)`, and in a system with a single kind of identity
it would be the better choice: `message` already carries `conversation_id`, so a composite foreign key would
let the database enforce that a sender belongs to the conversation they are writing into. Today that
invariant is held by code — `ResolveDirectParticipant` hands both ids to `AppendMessage` from one authorized
lookup — and not by a constraint. What rules the natural key out is the two rows with no `user_id`. Identity
here is polymorphic, and a surrogate key is what keeps that shape in one table instead of spreading it
across every table that references it.

There is a second reason to keep the key local: `user_id` is issued by the monolith. Making another
service's identifier part of this one's primary key would tie the storage layout to their identity scheme.
The surrogate is a layer of insulation, and it is also why a participant id — not a user id — is what
travels out to the browser on every message frame.

## Not every question reaches the service

A class of questions never arrives here at all. When a shopper's message matches a catalogue category, the
frontend answers it directly from data it already holds and never calls `/chat/bot` — no model, no quota,
no server round trip. This is why the question count a user generates runs ahead of the calls this service
sees, and why the quota numbers are smaller than the traffic suggests. The mechanism — the synonym
dictionary and category matching — is a frontend concern, described in the project README.

## The boundary

`internal/bot` owns the vocabulary: `bot.Client`, `bot.Turn`, `bot.ToolCall`, `bot.ToolResult`.
`internal/bot/gemini` is the only package that imports the SDK, and its whole job is converting types in
both directions and mapping provider errors onto `bot.ErrTimeout` / `bot.ErrBlocked` / the rest. The
retrier and the breaker sit above it and stay provider-agnostic.

That boundary has a price, and it is the reason for most of this note. A conversation is rebuilt from our
own types on every turn, so anything the SDK attached to the objects it returned is gone by the time the
next request goes out. For Gemini 3 that includes something the API insists on getting back.

## The 2.5 line is closed to new keys

The service was written against `gemini-2.5-flash-lite`. An API key created in August 2026 cannot reach it:

| Request | Result |
|---|---|
| `gemini-2.5-flash-lite` | `404 NOT_FOUND` — "no longer available to new users" |
| `gemini-2.5-flash` | `404 NOT_FOUND` |
| `gemini-3.5-flash-lite` | works |

The 404 body names `gemini-3.5-flash-lite` as the replacement, and that is the default the service ships
with. There is no retreat to an older model on a fresh key, which matters when reading advice about
Gemini 3: the common workaround for its stricter tool protocol is "use 2.5 instead", and that door is shut.

Two constants hold the default, `gemini.DefaultModel` and `config.defaultGeminiModel`, and `GEMINI_MODEL`
overrides both so a model can be swapped without a deploy.

## Thinking is a level, not a budget

The model must be told not to think, explicitly. Thinking tokens count towards the output cap, so leaving
the setting empty lets the model spend an unpredictable share of the 512-token ceiling on reasoning nobody
reads, and the visible answer is cut off mid-sentence. That failure is silent — the logs show a short reply
and no error at all.

Gemini 3 changed the dial from a token count to a level:

| `generationConfig.thinkingConfig` | Result |
|---|---|
| `thinkingBudget: 0` | `400 INVALID_ARGUMENT` |
| `thinkingLevel: "MINIMAL"` | works |
| `thinkingLevel: "LOW"` / `"HIGH"` | works |
| `thinkingLevel: "OFF"` / `"NONE"` | `400 INVALID_ARGUMENT` |

`MINIMAL` is the floor; thinking cannot be switched off entirely any more. It does preserve the property
the old `thinkingBudget: 0` was there for — a live call returned 22 output tokens for a 22-token answer,
so reasoning is not being billed into the reply.

## Function calls are signed, and the signature has to come back

Gemini 3 signs the `functionCall` part it emits, and refuses the follow-up turn unless that signature
returns untouched:

```
400 INVALID_ARGUMENT — Function call is missing a thought_signature in functionCall parts.
```

```mermaid
sequenceDiagram
  participant S as chat-service
  participant G as Gemini
  participant X as search-service

  S->>G: turn 1 — question + tool declaration
  G-->>S: functionCall search_products<br/>+ thoughtSignature
  S->>X: GET /search/detailed
  X-->>S: products with name, price, slug
  S->>G: turn 2 — history:<br/>functionCall + SAME signature, then functionResponse
  G-->>S: streamed answer
```

The signature travels as `bot.ToolCall.Signature`, an opaque `[]byte`. The bot layer never inspects it; it
only carries it from the response of turn one into the history of turn two, which keeps the provider-neutral
vocabulary intact while satisfying a requirement that is entirely Gemini's.

Google's function-calling guide says the SDKs handle thought signatures automatically. That is accurate for
callers that hand the SDK back the `Content` objects it produced. This service deliberately does not — it
converts everything to its own types — so the signature has to be plumbed by hand. The automatic handling
and the provider-agnostic layer are the same trade-off seen from two sides.

Two tests hold the round trip, one for reading the signature off the response and one for putting it back
on the wire. They exist because nothing else can fail: every other test in the package points the client at
an `httptest.Server`, which accepts a request whether or not the signature is there. Only the real provider
rejects it, and the real provider is never called from the test suite — except by `live_test.go`, guarded
behind the `gemini_live` build tag, which is the only check that the configured model name still exists.

## Known limits

- **One tool call per question.** The model may ask for several; the service runs the first and ignores the
  rest, so a single question cannot burn several search calls. It also sidesteps an open API bug where
  Gemini 3 Flash signs only the first one or two calls of a parallel batch, leaving the caller unable to
  return signatures for the others.
- **Signatures survive only within a turn pair.** Conversation history is stored as plain text and rebuilt
  from the database, so any signature attached to a non-tool part is dropped between requests. The tool loop
  is unaffected because it keeps its turns in memory, but this is the first thing to check if a future model
  starts requiring signatures more broadly.
- **A missing API key disables the bot, it does not stop the service.** `GEMINI_API_KEY` empty means the bot
  branch is never registered, so a deploy that forgets the key still serves everything else.
- **Free-tier traffic may be used to improve Google's products.** The service sends the question, the system
  prompt, and the tool results — public catalogue data and whatever the user typed. No order or account data
  crosses that boundary.
- **Read access to a direct conversation has two sources, and they can drift apart.** A buyer is admitted by a
  `participant` row carrying their user id. The shop side is admitted by the conversation's `shop_id` matching a
  shop the caller owns — a fact only the monolith can confirm, since this service has no shop table. A seller
  who has answered once holds both. Were a shop to change hands, the former owner would keep the participant row
  and keep reading the thread while the shop key already pointed elsewhere. Nothing transfers a shop today, so
  this is latent rather than live, and it cannot be closed by deleting the row: `message.sender_participant_id`
  references it, and the delete cascades to every message that participant ever sent.
