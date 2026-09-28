# SportsCal

Clean, customizable sports calendars. Pick a team, choose how its games appear, then download an `.ics` file or subscribe to a URL that stays up to date.

**https://sportscal.site**

![SportsCal builder](docs/screenshot.png)

By default an event is just:

| Field       | Value                                   |
| ----------- | --------------------------------------- |
| Title       | `Oklahoma vs Texas` / `Oklahoma @ Auburn` |
| Location    | The venue ESPN lists                    |
| Description | Blank                                   |

No ticket links, store links, social links or app ads. Add more with templates if you want it.

## Supported leagues

- **NFL**
- **NBA**
- **NCAAF** (NCAA Division I football — FBS by default, grouped by conference, with a "Show all teams" option for FCS and other divisions)

## Features

- Searchable team picker (name, school, mascot, abbreviation) grouped by conference/division from ESPN metadata
- Automatic season detection: the in-progress season, the upcoming season once ESPN publishes it, otherwise the latest one. NBA labels come from ESPN (`2026-27`), never from the numeric season id. Manual season override lives in a small secondary menu.
- Game types: Regular Season and Postseason on, Preseason off (NBA Play-In counts as postseason)
- Global templates for calendar name, event title, description and location, with a click-to-insert variable picker and live preview
- Minor per-game overrides (title, description, location, duration, include/exclude), stored as partial patches so later template changes still apply
- League-default durations: NFL/NCAAF 3h30, NBA 2h30, adjustable
- Events are **Free** (transparent) by default; optional Busy
- Optional ESPN link in the iCalendar `URL` field (off by default, never in the description)
- TBD kickoff times become all-day events and later turn into timed events **with the same UID**
- Canceled games stay on the calendar with `STATUS:CANCELLED`; postponed games without a new time become tentative all-day events
- Downloads (snapshot, nothing stored) and subscription feeds (regenerated from current ESPN data)
- Anonymous saved calendars with a private edit link — no accounts

## Feed URLs

Canonical feeds use the default settings and need no database record:

```
https://sportscal.site/calendar/nfl/pittsburgh-steelers.ics
https://sportscal.site/calendar/nba/oklahoma-city-thunder.ics
https://sportscal.site/calendar/ncaaf/oklahoma-sooners.ics
```

Custom feeds are saved configurations:

```
https://sportscal.site/calendar/ncaaf/oklahoma-sooners/{publicId}.ics
```

Manage a custom feed with its private link (the token lives in the URL fragment, which is never sent to the server):

```
https://sportscal.site/manage/{publicId}#token=SECRET
```

Deep links preselect the builder: `https://sportscal.site/?league=ncaaf&team=oklahoma-sooners`.

### How feeds update

Every feed request loads the configuration, resolves the season (when set to auto), reads the cached ESPN schedule, applies filters, templates and overrides, and generates the calendar. Schedules are never stored, so new start times, venue and broadcast changes, and postseason games show up on their own.

Auto-season feeds always represent **one** season: when ESPN's next season becomes the right one, the same URL switches to it. Calendar apps may keep events they already imported from the previous season; that depends on the app. Feeds pinned to a manual season never move.

### Stable UIDs

- Canonical feed: `espn-{eventId}-{teamId}@sportscal.site`
- Custom feed: `espn-{eventId}-{publicId}@sportscal.site`

UIDs never change between refreshes, so calendar apps update events in place instead of adding duplicates.

## Stack

Next.js (App Router) · TypeScript (strict) · React · Tailwind CSS · shadcn/ui · Geist · Lucide · [`ics`](https://github.com/adamgibbons/ics) · Zod · Drizzle ORM · PostgreSQL · pnpm · Vitest · Playwright

## Local development

Requirements: Node.js 22.13+ (24 recommended), pnpm, Docker (or any PostgreSQL 14+).

```bash
pnpm install
cp .env.example .env.local
docker compose up -d        # local PostgreSQL on :5432
pnpm db:migrate             # apply migrations
pnpm dev                    # http://localhost:3000
```

The builder, downloads and canonical feeds work without a database. Saving custom subscriptions needs PostgreSQL.

### Environment variables

| Variable                    | Required        | Description                                                              |
| --------------------------- | --------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`              | for saved feeds | PostgreSQL connection string                                             |
| `NEXT_PUBLIC_APP_URL`       | yes             | Public origin for feed/manage URLs (`https://sportscal.site` in production, `http://localhost:3000` locally) |
| `RATE_LIMIT_MAX`            | no              | Anonymous creates/updates per IP per window (default `20`)               |
| `RATE_LIMIT_WINDOW_SECONDS` | no              | Rate limit window (default `3600`)                                       |
| `RATE_LIMIT_SALT`           | no              | Salt for hashing IPs in the rate-limit table                             |
| `DATABASE_POOL_MAX`         | no              | Max connections per server instance (default `5`)                        |

### Database

Schema lives in `lib/db/schema.ts`; migrations in `drizzle/`.

```bash
pnpm db:generate   # create a migration after changing the schema
pnpm db:migrate    # apply migrations to DATABASE_URL
pnpm db:studio     # browse data
```

Any standard PostgreSQL works (Neon, Supabase, RDS, Railway, self-hosted). The driver is [`postgres`](https://github.com/porsager/postgres) with prepared statements disabled, so transaction-mode poolers (PgBouncer) are fine.

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test        # unit/integration tests, fixture-based, no network
pnpm test:live   # optional: live ESPN checks for the three example teams
pnpm test:e2e    # Playwright: builds, starts the app, uses live ESPN + DATABASE_URL
```

Unit tests use small sanitized ESPN fixtures in `tests/fixtures/espn` (Pittsburgh Steelers, Oklahoma City Thunder, Oklahoma Sooners) and parse generated calendars with [ical.js](https://github.com/kewisch/ical.js) as an independent validator. Run `pnpm exec playwright install chromium` once before E2E tests.

## Deploying to Vercel

1. Import the GitHub repository in Vercel (framework preset: Next.js).
2. Create a PostgreSQL database (Vercel Marketplace → Neon, or any provider) and set `DATABASE_URL`.
3. Set `NEXT_PUBLIC_APP_URL=https://sportscal.site`.
4. Deploy. The `vercel-build` script runs `drizzle-kit migrate` before `next build`, so migrations apply on each deploy.
5. Add the domain: **Project → Settings → Domains → Add `sportscal.site`** (and `www.sportscal.site` redirecting to it). At your DNS provider point the apex `A` record to `76.76.21.21` and `www` `CNAME` to `cname.vercel-dns.com` (or use Vercel nameservers). Vercel issues the TLS certificate automatically.

Feeds send `Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=3600`, so Vercel's CDN serves most calendar-app polling without touching ESPN. ESPN requests are cached server-side: team catalogs 24h, season metadata 6h, schedules 15 min (3h for completed seasons).

## Adding a league

Most of the work is one entry in `lib/config/leagues.ts`:

```ts
nhl: {
  key: "nhl",
  sport: "hockey",
  league: "nhl",
  label: "NHL",
  name: "National Hockey League",
  defaultDurationMinutes: 165,
  scheduleSeasonTypes: [1, 2, 3],
  seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
  teamGrouping: { kind: "groups" },
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
},
```

Add the key to `LEAGUE_KEYS`, check the ESPN responses for that league (season types, groups), add fixtures and tests. Templates, feeds, the picker and the season resolver work from the normalized model.

## Architecture

```
lib/
  config/leagues.ts      league registry (all league-specific behavior)
  espn/                  the only code that knows ESPN's JSON
    client.ts            URL building from the registry, fetch + caching, last-good fallback
    schemas.ts           defensive Zod schemas
    normalize.ts         normalizeTeam / normalizeGame / normalizeSeason / normalizeBroadcasts / normalizeVenue
    teams.ts seasons.ts schedules.ts
  calendar/              templates, filters, overrides, UIDs, events, ICS generator, feed pipeline
  db/                    Drizzle schema, client, saved-calendar repository
  security/              edit tokens (hashed, constant-time compare), rate limiting
  validation/            calendar config schema, limits, defaults
app/
  api/{leagues,teams,schedule,download,calendars}
  calendar/[league]/[...path]   .ics feeds
  manage/[publicId]             edit a saved calendar
components/{builder,schedule,subscription,layout,ui}
```

## ESPN data disclaimer

Schedule data comes from ESPN's public but undocumented API endpoints. They can change without notice; SportsCal isolates every assumption in `lib/espn` and degrades gracefully when optional fields are missing. SportsCal is not affiliated with or endorsed by ESPN or the leagues and teams listed.

## License

[MIT](LICENSE)
