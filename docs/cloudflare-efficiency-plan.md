# Cloudflare efficiency and cost-safety implementation plan

Status: handoff for a future implementation agent; no runtime changes in this PR.
Reviewed: 2026-10-29, main at `c80c1ef`.

## Owner requirements

- Keep SportsCal efficient, secure, and conservative toward ESPN.
- The account currently uses Workers Free. Do not upgrade the account or enable paid products as part of implementation.
- The owner also uses R2 for the Sleeper fantasy project. Account-wide usage must be considered; a new bucket does not create a new free allowance.
- **No unexpected R2 storage or operation charges, including during abuse or failures. Prefer unavailable/stale responses over additional spend.**
- No production resource creation, binding changes, deployment, or billing changes are authorized by this planning PR. Prepare and validate the implementation first; present the exact production changes for approval.

## Critical decision: R2 is optional and disabled by default

R2 is a good technical match for OpenNext's persistent cache, but its Standard storage free tier is an included allowance, not a documented automatic cutoff at that allowance. Pricing reviewed today includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations monthly, with billable overages. Budget alerts are informational and delayed; they do not stop spending.

Do not promise a zero-charge guarantee from TTLs, lifecycle rules, per-IP limits, dashboards, delayed analytics, or an emergency switch. Those reduce risk; they are not a provider-enforced account spending cap. Workers Free does not make R2 overages free.

**Shipping decision:** keep production R2 bindings absent and all R2 runtime/build/deploy I/O disabled unless a currently supported provider-enforced cutoff is verified to meet the owner's requirement, or the owner explicitly accepts the remaining risk after reviewing a concrete bounded design. Do not silently weaken this requirement to "unlikely to incur charges."

Implement useful improvements without R2. First evaluate a bounded shared cache for normalized public data in D1 on Workers Free, with Cache API in front, or use the existing PostgreSQL database if that is simpler and its own cost/availability limits are acceptable. Choose one shared store, document the choice, and avoid a database migration for saved calendars. D1 Free has enforced usage limits; confirm current behavior and account plan before choosing it. An account upgrade changes the billing assumptions for D1 and Durable Objects too.

If no shared-store design meets the constraints, ship the independent hardening first with regional Cache API caching, disclose its data-center-local scope, and retain conservative upstream budgets. Do not claim regional caching provides global deduplication.

## Current evidence and defects to reproduce

1. `open-next.config.ts` calls `defineCloudflareConfig()` with no cache override. Installed OpenNext resolves its incremental cache, queue, and tag cache to dummy implementations. The deployed version inspected on 2026-10-29 (`d068aea0-af2a-4b8c-9c25-356b8dfce1d0`) has Assets, self-reference, APP_URL, and secret bindings, but no R2 cache binding.
2. `lib/espn/schedules.ts` caches normalized schedules through `unstable_cache` and explicitly disables raw schedule-fetch caching. The intended persistent protection is therefore missing in Workers. Last-good maps are per isolate and are not a durable shared fallback.
3. `lib/http.ts` supplies public cache headers, but API/feed handlers do not explicitly store generated responses in Cache API. Browser freshness and shared edge caching are different mechanisms. Live API requests returned 200 with the advertised headers; this is not proof of shared cache hits.
4. `app/api/schedule/route.ts` resolves the automatic season and then calls `loadTeamSchedule`, which resolves it again.
5. Public schedules, team discovery, downloads, feed reads, saved-config reads, and DELETE do not have the same abuse protections as create/update. Random numeric team IDs can reach an upstream fallback in `findTeam`.
6. Active MLS refreshes issue up to 32 schedule requests concurrently (16 season types, each with results and fixtures). Optional-round failures need care so partial results do not replace a complete snapshot.
7. `lib/db/client.ts` uses React `cache()` for a purported per-request client. API route handlers cannot rely on Server Component memoization; repeated `getDb()` calls can create separate clients. Clients are not explicitly closed.
8. `readJson` buffers an entire body before comparing character length against a nominal byte limit.
9. Saved feeds fire `touchCalendar` without awaiting it or attaching it to request background lifetime. Concurrent requests can also race the hourly access update.
10. Calendar generation sets event modification time to generation time. Unchanged schedules can produce changed feed bytes. There are no explicit conditional GET validators.
11. CI runs `next build`, not the OpenNext production build/runtime checks. Existing cache tests mock `next/cache`.

Review checks already performed: clean checkout, production binding inspection, successful live NFL teams/schedule reads, 165 passing unit tests. No traffic/load measurements or account quota headroom were established. Recheck all evidence before implementation.

## Implementation sequence

### 1. Establish the billing boundary and bounded shared-cache design

- Inspect current Workers plan, account resources, deployed bindings, installed OpenNext version, and the other project's allocated usage without reading secrets into logs.
- Record actual daily request counts, CPU distribution and exceeded-CPU errors, cache effectiveness, upstream requests, and normalized object sizes where available. Separate measured values from estimates. Do not load-test ESPN or production.
- Document the chosen store, its platform-enforced Free behavior, maximum payload/entry count, refresh budget, eviction policy, and failure behavior. Use indexed fixed-key lookups; avoid request-driven scans or unbounded rows. Bound coordination/lease records as well as cached data.
- Cache normalized catalogs, season metadata, and schedules keyed by canonical league/team/year. Do not persist arbitrary query strings, raw large ESPN responses, or per-download customizations.
- Only supported teams/years may allocate new entries. Preserve supported historical/manual-season behavior; validation must not introduce arbitrary upstream probes.
- Store `fetchedAt`, freshness/stale deadlines, content/version hash, and last successful snapshot. Keep failed refreshes from replacing good data. Make intentional differences from Next's existing cache semantics explicit.
- Use demand-driven refreshes; no full-league cron prewarming by default. Exhausted quota, unavailable coordinator, or unknown budget must result in bounded stale data or 503, never unlimited ESPN fallback.

### 2. Add explicit response caching and correct invalidation

- Cache only successful public GET/HEAD responses for teams, schedules, and canonical default feeds using normalized keys. Reject or ignore irrelevant query parameters consistently before key construction. Never include bearer credentials or arbitrary host headers in cache keys.
- Cache API is a regional front cache; the chosen shared store remains authoritative for cached public data. Do not modify generated `.open-next` files.
- Keep mutation responses, management pages, token-bearing responses, and errors out of shared caching. Preserve response security headers.
- Start by excluding custom saved feeds from shared response caching unless edit/delete invalidation is implemented and tested. Define any allowed stale interval explicitly. Never let the public feed cache expose edit tokens/hashes.
- Stabilize feed output against unchanged inputs; use a content-derived ETag and conditional requests. Account for real config changes, schedule changes, season transitions, and cancellation semantics. Avoid marking every game modified merely because a client polled.
- Remove duplicate season resolution in the schedule handler and report actual snapshot freshness rather than request time as fetch time.

### 3. Bound ESPN traffic and public abuse

- Establish global and per-key refresh limits, shared leases with expiry, and a maximum in-flight upstream count. A per-isolate promise map alone is not global coordination. A coordinator must itself fit the chosen free-tier budget and fail closed.
- Resolve/validate canonical teams before expensive schedule work. Restrict or negatively cache the numeric-ID fallback without breaking valid teams omitted from catalogs.
- Start with existing freshness windows: catalogs 24 hours, seasons 6 hours, active schedules 15 minutes, completed schedules 3 hours. Measure before changing them; historical data is not necessarily immutable.
- Limit MLS fan-out concurrency; retain coverage for required fixtures/playoffs. Treat required and optional failures explicitly; never publish a deceptively complete partial schedule after transient errors.
- On upstream 429/503, honor valid `Retry-After` values and apply capped backoff with jitter. Limit retries and failed probes; use a shared cooldown/circuit breaker instead of a retry on every public request. Do not invent an official safe ESPN request quota for these undocumented endpoints.
- Rate-limit interactive API bursts and expensive downloads before expensive work. Protect saved-config reads and DELETE against abuse too. Keep normal calendar polling compatible; no interactive challenge on subscription feeds.
- Account for changing IPs: per-IP rules complement a global upstream budget. Do not add a PostgreSQL write to every public cache hit as the protection mechanism.
- Implement the JSON size limit in streamed UTF-8 bytes with cancellation when exceeded; `Content-Length` can be an early check, never the only check.

### 4. Fix PostgreSQL lifecycle and background work

- Replace React-only memoization with an explicit handler-scoped database context, reused across rate-limit/auth/config operations and closed in a reliable cleanup path.
- Keep connection strings secret and use the existing pooled endpoint where appropriate. Verify TLS without logging credentials. Keep prepared-statement behavior appropriate to the actual pooler.
- Avoid redundant authorization reads where a scoped context can safely reuse an authorized row; preserve token checks and parameterized SQL.
- Await access bookkeeping or attach it to the supported OpenNext/Cloudflare background lifetime. Make the hourly update conditional in SQL so simultaneous requests do not all write.
- Add bounded expiry/cleanup for obsolete rate-limit records. No unbounded per-IP storage growth.
- Hyperdrive is a later, measured optimization; do not add it automatically or enable query caching for authorization/mutations without evaluating consistency.

### 5. Validate on Workers and expose bounded operational signals

- Run lint, typecheck, unit tests, Next build, and OpenNext build. Add appropriate production build validation to CI; use Wrangler types for new bindings.
- Run runtime integration tests under workerd with stub ESPN responses and isolated local storage. Never start a local container/VM runtime. Stop any preview process after testing.
- Cover: repeated requests reuse data; concurrent requests across separate Worker contexts refresh once; cold/expired caches; restart recovery; quota exhaustion; coordinator failure; ESPN timeout/429/503; optional MLS failures; invalid teams; unknown query parameters; and stale-data maximum age.
- Verify mutation authorization, no token leakage, saved-feed invalidation/exclusion, deterministic unchanged feeds and 304 responses, and byte-accurate oversized-body rejection.
- Sample structured logs/traces at bounded volume. Track cache result, refresh count, upstream status/cooldown, budget denial, payload bytes, and CPU/errors. Never log credentials, tokens, raw IPs, custom text, or unbounded payloads. Do not add a billable analytics pipeline.
- Explicitly test Free-plan subrequest and CPU constraints using realistic large catalogs and MLS fixtures. Fast Node unit tests do not establish 10 ms Worker CPU compliance.
- Provide an operator runbook for degraded mode, cache disablement, rollback, and plan changes. Alerts are supplemental, not an enforcement mechanism.

## Optional R2 design: required safeguards before any enablement

This section is a gated alternative to the selected free-only shared store, not an instruction to provision R2 now.

- Use a dedicated private Standard bucket and direct Worker binding; no public domain, `r2.dev`, public upload, broad S3 credentials, or arbitrary object keys. Keep dev/staging isolated from production.
- Set explicit conservative application ceilings for total bytes, entry count, serialized bytes per object, and Class A/B attempts per actual billing cycle. Allocate them from account-wide remaining allowance with substantial headroom for Sleeper, builds, tools, retries, and other writers. Example ceilings are not proof of a safe account budget.
- Reserve capacity/operation permits atomically in durable shared coordination **before** each R2 operation. Include failed attempts that may be billed, HEAD/LIST, retries, concurrent writes, and ambiguous timeouts. Never refund an uncertain operation or reset the ledger on deploy/restart. No R2 call may bypass the gate to inspect whether budget remains.
- Prove all callers are covered: OpenNext adapter internals, regional-cache background refresh, queue processing, build/deploy cache population, migration, cleanup, manual tooling, and preview traffic. The stock R2 adapter is not a budget gate by itself. If it cannot be bounded, leave it disabled.
- Fixed overwrite keys and maximum serialized sizes must give a mathematical upper bound on stored bytes, including old build namespaces and in-flight replacements. Lifecycle deletion is cleanup only; billing uses daily peak storage, so later deletion does not undo an earlier peak.
- Treat unknown external/account usage as unsafe. An app-local ledger cannot guarantee the whole account stays free if Sleeper or another client can independently consume the shared allowance. Do not infer a fresh allowance from a new bucket or a UTC month boundary; verify product billing-cycle semantics.
- Exhausted/unavailable budgets, kill switch, and default-off mode must make **zero R2 calls** and avoid uncontrolled upstream fallback. Test saturation, races, counter persistence, clock/billing-cycle changes, and crash recovery. Prefer 503 to surprise spending.
- Document residual exposure honestly. Application controls cannot guarantee safety against bugs, bypasses, account changes, or other writers. If a provider hard cutoff is unavailable and the owner retains an absolute zero-overage requirement, R2 stays disabled.
- Add alerts and lifecycle cleanup only as secondary controls, never acceptance evidence for a no-charge guarantee. Scope any account-level recommendation to this project; do not modify Sleeper's resources.

## Workers Free versus the $5 plan

Remain on Free for the first implementation and measurement pass. It currently enforces 100,000 daily requests and 10 ms CPU per invocation. This protects against Workers usage overages but can cause failures; it does not cap separately billed R2 usage.

Workers Paid is a minimum $5/month account charge, with 10 million monthly requests and 30 million CPU milliseconds included, followed by usage charges. For a Next.js/OpenNext app with JSON normalization and ICS generation, more CPU headroom may be useful. Recommend the upgrade only after measuring CPU failures or capacity needs; it is a reliability decision, not a cost-safety measure. It is not a $5 maximum bill.

If the owner later approves Paid, reassess every free-plan failure/cost assumption, including D1, Durable Objects, logs, builds, and R2. Set measured per-invocation CPU/subrequest limits and retain application budgets, but do not describe those as an account-wide monthly spending cap. No plan change is authorized here.

## Delivery and release gates

Deliver implementation as reviewable PRs, preferably: (1) independent hardening and runtime test coverage, (2) selected bounded cache and coordination, (3) optional R2 only after its separate gate is satisfied. Preserve existing saved-calendar URLs, UIDs, edit tokens, and manual-season behavior.

Before requesting production approval, provide exact resource/binding/migration changes, installed-version compatibility, the current pricing/limits evidence, cache/upstream request measurements from isolated tests, CPU evidence, and rollback/degraded-mode steps. Tests must show quota denial stops work, rather than merely logging a warning.

Do not report completion as "free-tier safe" from tests alone. State the enforcement boundary and remaining failure modes. If the absolute R2 no-charge gate is unmet, completion means R2 remains unbound and unused while the other improvements are delivered.

## Primary references (recheck before implementation)

- [OpenNext caching](https://opennext.js.org/cloudflare/caching): default configuration, R2 incremental cache, regional cache, queue, and tag-cache requirements. A custom normalized-data store is a separate design; do not pretend an arbitrary store is a supported OpenNext adapter.
- [Workers caching behavior](https://developers.cloudflare.com/workers/reference/how-the-cache-works/): caching Worker-generated responses with Cache API.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [pricing](https://developers.cloudflare.com/workers/platform/pricing/): Free CPU/request limits and Paid overages.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): included Standard allowances, billable operations, overages, and daily peak storage accounting.
- [Budget-alert announcement](https://developers.cloudflare.com/changelog/product/workers/3/): 2026-07-20 entry explicitly says alerts do not cap usage and are processed after the activity.
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/): enforced Free usage behavior and plan-change implications.
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): SQLite-only Free availability and operations failing after Free quotas are exceeded.
- [React cache](https://react.dev/reference/react/cache): Server Component scope.
- [Postgres.js with Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/): per-request client guidance; adapt to the actual connection path.
