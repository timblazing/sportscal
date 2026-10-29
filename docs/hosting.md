# Hosting

`sportscal.site` runs on Vercel (Hobby plan, project `sportscal`). The DNS records
live in Cloudflare as DNS-only records pointing at Vercel, so Cloudflare does not
proxy the site and Vercel issues the certificate.

## Deploying

Every push to `main` deploys to production through Vercel's GitHub integration.
Pull requests get preview deployments. Vercel runs `pnpm vercel-build`, which
typechecks, lints and tests before `next build`, so a failing check stops the
deploy and leaves the current version live.

Environment variables (`vercel env ls`): `APP_URL`, `DATABASE_URL`,
`DATABASE_URL_POOLED` and `RATE_LIMIT_SALT`, set for Production only. Preview
deployments have no database, so saved calendars are unavailable there and
pull-request code never touches production data. Set `SPORTS_DATA_DISABLED=1`
and redeploy to stop all ESPN requests.

Rollback: `vercel rollback` (or dashboard → Deployments → Promote an earlier
deployment), then revert the bad commit on `main`.

## Caching

- Default feeds and the teams/schedule APIs send `s-maxage` with
  `stale-while-revalidate`, so Vercel's CDN answers repeats without invoking a
  function.
- Normalized ESPN data (team catalogs, seasons, schedules) lives in Next's data
  cache (`unstable_cache` in `lib/cache/shared.ts`), shared by every function
  instance. A failed refresh keeps serving the previous entry.
- Saved custom feeds are `no-store` and re-read their config on every request,
  so edits and deletes take effect immediately. They still send an ETag, so
  calendar apps get a bodyless 304 when nothing changed.

## Limits and billing

The billing boundary is the Hobby plan itself: it has no paid overages, so
exceeding a limit pauses the project instead of charging. Neon's free plan
works the same way for the database. The relevant Hobby allowances are 4 hours
of active CPU and 1M function invocations a month. Usage: dashboard → Usage.

Inside those limits, the app keeps one client or runaway misses from using them up:

- Unknown query parameters get a 400, and unknown teams a 404, before any ESPN
  request, so cache keys stay bounded.
- Each function instance caps ESPN at 1,000 requests a day and stops calling it
  after a 429/503 until `Retry-After` passes (`lib/cache/shared.ts`).
- Each instance also limits CDN misses per client and in total
  (`lib/cache/abuse.ts`). Saved-calendar writes have a per-IP limit stored in
  Postgres (`lib/security/rate-limit.ts`).
- Client IPs come from `x-forwarded-for`, which Vercel overwrites.
  `cf-connecting-ip` is ignored because any client can set it here.

## Why not Cloudflare Workers

SportsCal ran on Cloudflare Workers (OpenNext) through October 2026, with D1 as a
shared cache and ESPN budget, and Hyperdrive in front of Neon. On Workers Free,
cached requests used ~30 ms of CPU and uncached renders 200–800 ms, against
Free's 10 ms limit. Requests only succeeded because of the burst allowance. The
same pattern took the Sleeper dashboard down, so hosting moved to Vercel Hobby.
The Cloudflare pieces (wrangler config, D1 schema, workerd tests) were removed,
and the commits are in history if that path is ever revisited.
