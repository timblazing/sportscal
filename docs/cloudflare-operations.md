# Cloudflare operations: cost boundary, deployment, and rollback

Applies to the implementation of `docs/cloudflare-efficiency-plan.md`. Written 2026-10-29, after the account moved from Workers Free to Workers Paid ($5/month). Recheck prices against the linked Cloudflare pages before approving; the figures below are the ones in effect when this was written.

## What changed with Workers Paid

Workers Free enforced a hard boundary: 100,000 requests/day and 10 ms CPU per invocation, and D1 Free stopped serving once its daily quota was used. **Workers Paid removes those cutoffs.** Usage beyond the included amounts is billed, not refused. Budget alerts and billing notifications report usage after the fact. They do not stop spending.

So no setting in this repository is an account-wide spending cap. The controls below bound specific costs. Each section states what bounds it.

| Product | Included with Paid | Overage | What bounds SportsCal's usage |
|---|---|---|---|
| Workers requests | 10 M/month | $0.30 per M | **Nothing in the app.** Every request that reaches the Worker is billed, including requests the app rejects. Only edge rules that act before the Worker (see "Edge rate limit") reduce this. |
| Workers CPU | 30 M CPU-ms/month | $0.02 per M CPU-ms | `limits.cpu_ms = 200` per invocation in `wrangler.jsonc`. Cache hits and rejections use a few ms. |
| Workers Logs | 20 M events/month | $0.60 per M | `observability.head_sampling_rate = 0.1`. About 200 M requests/month would be needed to pass the included amount. |
| D1 rows written | 50 M/month | $1.00 per M | Bounded by design: about 30 k/day maximum (below). |
| D1 rows read | 25 B/month | $0.001 per M | Indexed fixed-key lookups only, a few rows per request. Proportional to request volume. |
| D1 storage | 5 GB | $0.75 per GB-month | Fixed slots: at most about 130 MB (below). |
| Cache API | No charge | — | Regional and data-center local. Not a billing risk. |
| R2 | — | — | **Not bound and never called.** The plan's R2 gate is unmet; Paid does not change that. |
| ESPN (external) | — | — | Global budget of 1,000 attempts/day, at most 4 in flight, and a shared cooldown after 429/503. |

These allowances are shared across the account: D1 with the Graco database, and Workers requests/CPU with every Worker on the account. The SportsCal bounds below are well under the included amounts, but they do not reserve allowance for other projects.

## Selected architecture

- **D1 (`SPORTSCAL_CACHE`) is the single shared store** for normalized catalogs, season metadata, and schedules, for the global upstream budget and permits, and for public admission counters. The saved-calendar PostgreSQL database is unchanged and has no migration.
- **Cache API** sits in front for successful public GET/HEAD responses (teams, schedules, canonical feeds). It is regional only. D1 is the source of truth, and regional hits make no D1 calls.
- Saved custom feeds are never stored in a shared cache. They re-read their configuration on every request, so edits and deletes take effect immediately. They still get ETags and 304 responses.
- **Failure policy: fail closed.** Missing D1, an exhausted budget, a cooldown, or a coordinator error returns the last good snapshot (up to 7 days old) or a 503. It never falls back to unlimited ESPN calls.

### Why D1 stays the right store on Paid

D1 was chosen partly for Free's enforced cutoff, which Paid removes. It still fits, because the design bounds its own usage.

- **Storage.** `cache_entries` has 512 fixed slots of at most 256 KiB each (128 MiB). `public_admissions` has at most 1 + 4 × 1,024 rows, `upstream_permits` 4 rows, and `upstream_budget` 1 row. Writes overwrite fixed keys, and no request can add rows.
- **Writes per day (upper bound).**
  - Admissions: two upserts per regional-cache miss, until the global ceiling of 10,000 admissions/day. After that, the conditional upsert matches nothing and writes nothing. That is at most about 20 k.
  - Upstream: each of at most 1,000 attempts claims a permit, increments the budget, releases the permit, and sometimes sets a cooldown. That is at most about 5 k.
  - Snapshots: each refresh writes a lease and a payload. Refreshes are limited by the upstream budget, so at most about 2 k.
  - Total: about 27 k/day, or about 0.8 M/month, against 50 M included.
- **Reads** grow with request volume and are not capped by the app. At a few rows per request, it would take billions of requests per month to reach 25 B. Workers request charges would be far larger first.

A Durable Object coordinator would add a second billed product, and the bounds are already met. Hyperdrive and R2 are not used.

## Remaining cost exposure (honest statement)

There is no zero-charge guarantee. The enforcement boundaries are:

1. **Request floods are the open exposure.** Workers Paid bills every request that invokes the Worker. The app rejects abusive traffic cheaply with 429/503 responses and no D1 writes after the daily ceiling, but each of those requests is still billed. For example, an extra 100 M requests in a month costs about $27 for requests plus CPU. An edge rate-limiting rule (below) reduces this, because blocked requests never invoke the Worker. Cloudflare's automatic DDoS mitigation also applies. Neither is a dollar cap.
2. **Per-request CPU** is capped at 200 ms by the platform. Exceeding it fails that request; it is not billed further.
3. **D1** stays far below the included amounts by construction. Bugs or a future code change could break those bounds, and alerts would report it only afterwards.
4. **R2** has zero exposure from SportsCal: no binding exists and no code path calls it. Sleeper's R2 usage is unaffected and unbounded by this project.
5. **The PostgreSQL provider** (saved calendars) bills separately. Management routes are rate-limited, and the old unbounded per-IP rate-limit rows are cleaned up incrementally (32 per request).

## Deployment (requires owner approval; nothing below has been run)

Merging to `main` appears to deploy automatically: a new production version was created minutes after PR #18 merged. **Do not merge the implementation PR until steps 1–4 are done.** As a tripwire, `wrangler.jsonc` contains the placeholder `database_id` `REPLACE_WITH_APPROVED_D1_DATABASE_ID`. A deploy with the placeholder should fail at upload, leaving the current production version running. This was not tested, because testing it would require a deploy.

1. In the dashboard, confirm the account is on Workers Paid (Workers & Pages → Plans). The available API token could not read subscriptions. Optionally add billing notifications; they are informational only.
2. Create the database. This creates a production resource:
   ```sh
   pnpm exec wrangler d1 create sportscal-cache
   ```
   Put the returned `database_id` in `wrangler.jsonc` on the PR branch and push. CI re-runs.
3. Apply the schema:
   ```sh
   pnpm exec wrangler d1 migrations apply sportscal-cache --remote
   pnpm exec wrangler d1 execute sportscal-cache --remote --command "SELECT * FROM upstream_budget; SELECT COUNT(*) FROM upstream_permits;"
   ```
   Expect one budget row (`budget_day = -1`) and 4 permits.
4. Optional, recommended (a zone change): add a WAF rate-limiting rule for `sportscal.site`. Match the URI path starting with `/api/` or `/calendar/`, count per IP, allow 100 requests per 10 seconds, action Block, duration 10 seconds. Calendar clients poll far below this. Check how many rules your zone plan includes.
5. Merge the PR, or run `pnpm run deploy` if auto-deploy is off. The deploy adds the `SPORTSCAL_CACHE` binding, `limits.cpu_ms = 200`, and log sampling of 0.1. Existing secrets and `APP_URL` are unchanged.
6. Verify without load-testing:
   ```sh
   curl -sI "https://sportscal.site/api/teams?league=nfl"          # 200, etag
   curl -sI "https://sportscal.site/calendar/nfl/pittsburgh-steelers.ics"
   curl -sI -H 'if-none-match: "<etag from previous>"' "https://sportscal.site/calendar/nfl/pittsburgh-steelers.ics"   # 304
   pnpm exec wrangler d1 execute sportscal-cache --remote --command "SELECT budget_day, attempts, cooldown_until FROM upstream_budget"
   ```
   Also open one existing saved-calendar feed URL and its manage page to confirm they still work.

## Degraded mode and rollback

- **Stop all ESPN traffic** while still serving cached responses already in regional caches: set the variable `SPORTS_DATA_DISABLED=1` (dashboard → Worker → Settings → Variables, or `wrangler secret put SPORTS_DATA_DISABLED`). Uncached public data then returns 503. Delete the variable to resume.
- **Inspect coordination:** query `upstream_budget` (daily attempts, cooldown) and `cache_entries` (`cache_key`, `fetched_at`, `fresh_until`, `stale_until`).
- **Clear a stuck cooldown** only after checking that ESPN has recovered:
  ```sh
  pnpm exec wrangler d1 execute sportscal-cache --remote --command "UPDATE upstream_budget SET cooldown_until=0"
  ```
- **Roll back code:**
  ```sh
  pnpm exec wrangler deployments list
  pnpm exec wrangler rollback 987b330d-a043-4a17-93a7-a973a8e16ca7
  ```
  That version ID is the production version before this work. The old version ignores D1, so rollback needs no data change. The D1 database can stay or be removed later with `wrangler d1 delete sportscal-cache`.
- **Plan change back to Free:** first remove `limits` from `wrangler.jsonc`, because CPU limits are Paid-only. D1 Free would then refuse work past its daily quota, which this code treats as unavailable and answers with stale data or 503.

## Validation evidence (local, isolated)

- `pnpm test`: unit tests, including routes, body limits, saved-calendar security, response cache, and DB lifecycle.
- `pnpm build:worker`: OpenNext build plus a Wrangler dry-run bundle (about 1.8 MiB gzip).
- `pnpm test:workerd`: coordinator tests against local D1 across two Worker instances (deduplication, restart, quota, permits, cooldown, coordinator failure). It also runs the **real production bundle** under workerd with local D1 and a stubbed ESPN outbound:
  - teams, schedule, and feed use 6 ESPN calls in total, with 0 for repeats and after restart;
  - feeds are byte-identical after restart, with matching ETags and 304s;
  - regional hits make no D1 writes;
  - unknown query parameters and teams make no upstream probe;
  - missing D1 or the kill switch gives 503 with zero ESPN calls;
  - an ESPN 503 sets a shared cooldown;
  - body limits count UTF-8 bytes.
- Not established locally: production CPU distribution under the 200 ms cap. Watch `exceededCpu`/`exceededResources` in Workers analytics after deploy. On Free, 7 of 921 requests on 2026-10-28 ended in `exceededResources`.

## References

- Workers pricing and limits: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/
- Workers Logs pricing: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- WAF rate limiting rules: https://developers.cloudflare.com/waf/rate-limiting-rules/
- Wrangler `limits`: https://developers.cloudflare.com/workers/wrangler/configuration/#limits
