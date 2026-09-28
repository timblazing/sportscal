# SportsCal — Complete Build Specification

You are a senior full-stack TypeScript engineer and product designer. Build a complete, polished, production-ready web application called **SportsCal**, intended to run publicly at:

**https://sportscal.site**

The application generates clean, customizable `.ics` / iCalendar sports schedules from ESPN’s public/undocumented API endpoints.

This should be built as a real deployable open-source project, not a prototype.

Do not stop midway to ask routine implementation questions. Make sensible engineering decisions consistent with this specification. If an undocumented ESPN response differs slightly from expectations, inspect the real API response, normalize it cleanly, and continue.

---

# 1. Product goal

SportsCal should solve a simple problem:

> Pick a sports team, customize how its games appear on a calendar, then either download an `.ics` file or subscribe to a URL that automatically stays updated.

The application should initially support:

- NFL
- NBA
- NCAA Division I Football / NCAAF

ESPN is the schedule/team data source.

The site should intentionally produce much cleaner events than services such as YourSportsCalendar/ECAL.

Do **not** fill event descriptions with promotional links, social links, store links, ticket links, app advertisements, or other unnecessary content.

The default generated event should be minimal:

**Title**

`Oklahoma vs Texas`

or

`Oklahoma @ Auburn`

**Location**

The actual venue from ESPN.

**Description**

Blank.

Users can add additional information through templates if they want it.

---

# 2. Primary user flow

The main workflow should be:

1. Choose league.
2. Choose team.
3. Automatically determine the appropriate season.
4. Fetch the team's schedule from ESPN.
5. Configure which games are included.
6. Customize event/calendar templates.
7. Preview the generated events.
8. Optionally make minor per-game overrides.
9. Download `.ics`.
10. Or save the configuration and receive a permanent subscription URL.

The site should feel like one cohesive configurator rather than a collection of disconnected pages.

Do not require user accounts.

---

# 3. Technology stack

Use:

- Next.js using the App Router
- TypeScript with strict mode
- React
- Tailwind CSS
- shadcn/ui
- Geist Sans for the primary UI font
- Geist Mono where useful for URLs, variables, IDs, dates, and technical values
- Lucide icons
- `adamgibbons/ics` for iCalendar generation
- Zod for validation
- Drizzle ORM
- PostgreSQL
- pnpm
- Vitest for unit/integration tests
- Playwright for important end-to-end flows

Do not add Redux, Zustand, GraphQL, tRPC, or another abstraction unless there is a clear need.

Prefer React state, server components, server actions/API routes where appropriate, and small focused utility modules.

Keep dependencies modest.

---

# 4. Overall visual design

Use a **Vercel-inspired dark interface**.

The visual language should closely resemble Vercel's dashboard/product pages without copying Vercel branding or logos.

Use:

- Near-black / black page background
- Slightly lighter neutral surfaces
- Thin crisp neutral borders
- White primary text
- Gray secondary text
- Geist typography
- Restrained use of color
- Compact controls
- Small or moderate border radii
- Strong alignment
- Generous but purposeful whitespace
- Subtle hover transitions
- Clear focus states
- Minimal shadows
- No glassmorphism
- No giant gradients
- No colorful SaaS-style marketing aesthetic
- No excessive rounded cards
- No oversized hero section

The site is primarily a utility.

A good rough palette is:

- Page background: `#000`
- Raised surface: approximately `#0a0a0a`
- Secondary surface: approximately `#111`
- Borders: approximately `#262626`
- Primary text: approximately `#ededed`
- Muted text: neutral gray
- Main CTA: white background / black text

Use shadcn semantic CSS variables instead of scattering literal colors throughout the project.

Set:

`color-scheme: dark`

This can be a dark-only app in v1. A theme toggle is unnecessary.

Use Geist Sans and Geist Mono from the supported Geist package / Next.js integration.

Set browser `theme-color` appropriately for the black background.

---

# 5. Header

Create a restrained top navigation.

Left:

**SportsCal**

Use a simple original mark if desired, such as a minimal calendar outline combined with a small sports dot/ball motif, but don't overdesign it.

Right side:

- GitHub link
- About / data source information if appropriate

Do not clutter the header.

---

# 6. Main page layout

The homepage should immediately present the calendar builder.

A desktop layout can use a two-column configuration/preview arrangement once a team is selected.

For example:

**Left / main controls**

- League
- Team
- Season
- Included games
- Event templates
- Calendar settings
- Advanced settings

**Right**

- Calendar/event preview
- Schedule event list
- Download
- Subscribe

On narrower screens stack everything vertically.

The application should be fully usable on mobile.

---

# 7. League selection

Support this internal registry:

```ts
nfl = {
  sport: "football",
  league: "nfl",
  label: "NFL",
  defaultDurationMinutes: 210
}

nba = {
  sport: "basketball",
  league: "nba",
  label: "NBA",
  defaultDurationMinutes: 150
}

ncaaf = {
  sport: "football",
  league: "college-football",
  label: "NCAAF",
  defaultDurationMinutes: 210
}
```

Display the three leagues as clean selectable buttons/cards/tabs.

League selection should update the team picker without a full page reload.

---

# 8. ESPN API

Use ESPN's public endpoints as the source of truth.

Helpful references:

https://github.com/pseudo-r/Public-ESPN-API

https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c

Do not scrape ESPN HTML pages.

The Site API generally follows patterns such as:

```text
https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams
```

and:

```text
https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{teamId}/schedule
```

Use ESPN's league/core season/calendar endpoints where useful for determining seasons.

Examples that must be investigated and verified during development:

```text
football/nfl
basketball/nba
football/college-football
```

Do not blindly assume response fields. During implementation, make real requests and inspect the actual responses for all three leagues.

Build a clean ESPN adapter layer so the rest of SportsCal never directly depends on ESPN's raw JSON structure.

---

# 9. ESPN architecture

Create modules similar to:

```text
lib/
  espn/
    client.ts
    leagues.ts
    teams.ts
    schedules.ts
    seasons.ts
    normalize.ts
    schemas.ts
    types.ts
```

Only those modules should need to understand ESPN's response format.

The rest of the application should operate on SportsCal's normalized objects.

Do ESPN requests server-side.

Do not have every browser directly hammer ESPN.

Validate/defensively parse important ESPN responses.

Gracefully handle missing optional fields.

---

# 10. Normalized team model

Normalize teams into something approximately like:

```ts
interface SportsCalTeam {
  id: string
  slug: string
  name: string
  shortName: string
  displayName: string
  abbreviation: string
  logo?: string
  color?: string

  league: "nfl" | "nba" | "ncaaf"

  conference?: {
    id?: string
    name: string
    shortName?: string
  }

  division?: {
    id?: string
    name: string
  }

  isFbs?: boolean
}
```

Don't leak raw ESPN objects into UI components.

---

# 11. Team picker

The team picker should be excellent.

Use a shadcn Combobox / Command-style searchable picker.

Users should be able to search by:

- full team name
- school/location
- mascot
- abbreviation

For NFL and NBA, organize by conference/division if ESPN metadata makes that practical.

For NCAAF:

## Default behavior

Show **FBS teams only**.

Group teams by conference.

Examples:

- SEC
- Big Ten
- Big 12
- ACC
- etc.
- Independents

Include an option:

**Show all teams**

When enabled, expose FCS / other teams returned by ESPN too.

ESPN commonly identifies FBS with group `80`. Verify current ESPN behavior rather than hardcoding assumptions blindly.

Use ESPN conference/group metadata when possible instead of maintaining a giant manually hardcoded team list.

The user should not have to know an ESPN team ID.

---

# 12. Automatic season selection

This is a major feature.

Users should normally **not need to select a season**.

Automatically determine:

- active/current season when the league is in season
- upcoming published season during the offseason
- latest published season if ESPN has not published the upcoming schedule yet

Do not simply use:

```ts
new Date().getFullYear()
```

That is not robust enough.

NBA is particularly important because ESPN's numeric season representation may correspond to the ending calendar year of the season.

For example, never blindly assume a numeric season ID maps directly to a display label.

Use ESPN's own season metadata/display labels whenever possible.

## Resolver strategy

Create something such as:

```ts
resolveLeagueSeason(league, now)
```

The resolver should:

1. Query ESPN league season/calendar metadata.
2. Identify ESPN's current reported season.
3. Determine whether games remain in that season.
4. Inspect the next candidate season when appropriate.
5. Prefer an upcoming season when the current/previous season has ended and the next schedule has been published.
6. Fall back to the latest available season if the next schedule is not yet published.
7. Return both the ESPN season identifier and a friendly display label.

Example result:

```ts
{
  espnSeason: 2027,
  displayName: "2026-27",
  status: "upcoming"
}
```

or:

```ts
{
  espnSeason: 2026,
  displayName: "2026",
  status: "active"
}
```

The exact output should be driven by ESPN data.

Add tests specifically for season boundary/offseason behavior.

---

# 13. Manual season override

Automatic should be the normal experience.

Add a small advanced control such as:

**Season: Auto — 2026**

with the ability to manually select another available season.

Keep it visually secondary.

Users should not be confronted with season configuration unless they want it.

---

# 14. Normalized game model

Create a normalized game structure approximately like:

```ts
interface SportsCalGame {
  id: string

  league: "nfl" | "nba" | "ncaaf"
  seasonId: string | number
  seasonDisplayName: string

  startDate: string

  dateTBD: boolean
  timeTBD: boolean

  seasonType: {
    id?: string | number
    name: string
    normalized:
      | "preseason"
      | "regular"
      | "postseason"
      | "other"
  }

  week?: {
    number?: number
    label?: string
  }

  homeTeam: SportsCalTeam
  awayTeam: SportsCalTeam

  selectedTeamHomeAway: "home" | "away"

  neutralSite: boolean

  venue?: {
    name?: string
    city?: string
    state?: string
    country?: string
  }

  broadcasts: string[]

  status: {
    state: "pre" | "in" | "post"
    completed: boolean
    cancelled?: boolean
    postponed?: boolean
    detail?: string
  }

  espnUrl?: string
}
```

Adapt as needed based on real response data.

---

# 15. Included game types

Provide checkboxes or switches for:

- Preseason
- Regular Season
- Postseason

Defaults:

```text
Preseason: OFF
Regular Season: ON
Postseason: ON
```

Apply this consistently across the supported leagues.

Map ESPN's actual season-type metadata to the normalized values rather than relying solely on magic numbers.

If postseason events are not scheduled yet, subscription feeds should naturally acquire them later when ESPN adds them.

---

# 16. Event template system

This is one of the most important parts of SportsCal.

The application should primarily use **global templates**.

Users should be able to define templates for:

- Calendar name
- Event title
- Event description
- Event location

Do not use `eval` or execute template strings as JavaScript.

Implement a small deterministic variable replacement engine.

---

# 17. Default templates

## Calendar name

```text
{team} {season} Schedule
```

## Event title

```text
{team} {homeAwaySymbol} {opponent}
```

## Event description

Blank.

## Location

```text
{venue}
```

`{homeAwaySymbol}` should render:

```text
vs
```

for home games and:

```text
@
```

for away games.

Neutral-site handling should still produce a sensible title.

---

# 18. Supported template variables

At minimum support:

```text
{team}
{teamShort}
{teamAbbr}

{opponent}
{opponentShort}
{opponentAbbr}

{homeTeam}
{awayTeam}

{homeAbbr}
{awayAbbr}

{homeAway}
{homeAwaySymbol}

{league}

{season}
{seasonType}

{week}

{venue}
{city}
{state}

{broadcast}

{date}
{time}

{status}
```

Add other obviously useful normalized values if ESPN exposes them reliably.

Unknown/missing values should render as empty strings rather than `"undefined"` or `"null"`.

Clean up obvious double spaces caused by empty optional variables.

Do not implement a full scripting language.

---

# 19. Template editor UI

Each template field should provide:

- input/textarea
- short help text
- variable insertion menu
- live rendered example

For description, use a multiline textarea.

Display available variables as small clickable badges/buttons.

Clicking one should insert it at the cursor.

Examples:

`{team}`

`{opponent}`

`{broadcast}`

`{venue}`

Avoid forcing users to memorize them.

---

# 20. Live preview

Changes to templates should immediately update the preview.

Show several actual games from the fetched schedule.

Each preview item should visually show:

- date
- start time
- rendered event title
- rendered description if present
- venue
- game type
- broadcast if the user's template includes it

Make the preview closely resemble what someone would understand as a calendar event, but don't try to visually clone Apple Calendar or Google Calendar.

---

# 21. Per-game overrides

Support per-game overrides, but deliberately keep this as a **minor/advanced feature**.

The expected workflow is global templates.

Each event in the schedule preview can have a small overflow menu or Edit button.

Open a shadcn Dialog/Sheet allowing overrides for:

- title
- description
- location
- duration
- include/exclude game

Overrides must be **partial**.

Example:

If a user overrides only the title, future global description/template changes should still apply to that event.

Store overrides keyed by ESPN event ID.

Display a subtle `Override` badge on modified games.

Include:

**Reset overrides**

Do not design the entire product around manually editing every event.

---

# 22. Event durations

Defaults:

```text
NFL:   3 hours 30 minutes
NCAAF: 3 hours 30 minutes
NBA:   2 hours 30 minutes
```

Expose a global duration setting.

Users may adjust hours/minutes.

Individual event duration can be overridden through the minor per-game override feature.

---

# 23. Date/time handling

ESPN generally supplies timestamps in ISO/UTC form.

Treat ESPN timestamps carefully.

Generate timed `.ics` event timestamps in UTC whenever possible and let calendar clients render them in the user's timezone.

Avoid generating calendar events tied unnecessarily to the timezone of the server.

Do not use the visitor's browser timezone to permanently rewrite ESPN timestamps.

---

# 24. TBD kickoff/start times

Sports schedules frequently contain games whose date is known but exact start time is TBD.

Handle this intentionally.

If:

```text
date known
time TBD
```

create an **all-day event for that date**.

When ESPN later publishes a time, a subscription feed must replace/update that event using the **same UID**, turning it into the correctly timed event rather than producing a duplicate.

If even the date is truly unknown, handle it gracefully and do not invent a fake date/time.

---

# 25. Event status changes

Handle schedule changes.

If ESPN changes:

- kickoff/start time
- venue
- opponent
- broadcast
- postseason placement

the next subscription refresh should reflect it.

For postponed events:

- update to the new time if one exists
- otherwise preserve a sensible tentative/TBD representation

For cancelled games:

- preserve the event with iCalendar `CANCELLED` status where appropriate rather than silently creating confusing duplicates

Use stable UIDs.

---

# 26. iCalendar generation

Primary library:

https://github.com/adamgibbons/ics

Other references if useful:

https://github.com/spatie/icalendar-generator

https://github.com/collective/icalendar

Generate standards-compliant `VCALENDAR` / `VEVENT` data.

Use approximately:

```text
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
```

Use a SportsCal-specific product identifier, for example:

```text
-//sportscal.site//SportsCal//EN
```

Calendar event descriptions should remain plain text by default.

Do not inject HTML advertisements or links.

---

# 27. Stable UID design

Stable UIDs are critical.

An event must retain the same UID across subscription refreshes.

For a default/canonical team feed, use an approach equivalent to:

```text
espn-{eventId}-{teamId}@sportscal.site
```

For a custom saved subscription, associate the UID with the custom calendar configuration:

```text
espn-{eventId}-{calendarPublicId}@sportscal.site
```

Do not generate a fresh random event UID on every HTTP request.

Otherwise calendar clients will create duplicate games.

---

# 28. Busy/free behavior

Sports schedules usually should not automatically block someone's work availability.

Default events to:

**Free / transparent**

Expose an advanced option allowing users to switch to Busy if desired.

---

# 29. Optional URL field

Do not put promotional URLs in event descriptions.

An advanced option may allow:

**Include ESPN event URL**

Default:

OFF.

If enabled, populate the proper iCalendar `URL` field rather than dumping links into DESCRIPTION.

---

# 30. Downloads

Include a prominent:

**Download .ics**

button.

For a download:

- generate the current selected schedule/configuration
- produce a `.ics` file immediately
- use a friendly filename such as:

```text
oklahoma-sooners-2026.ics
```

Set appropriate headers:

```text
Content-Type: text/calendar; charset=utf-8
```

and download disposition.

A user should be able to use downloads without creating/saving anything in the database.

---

# 31. Subscription feeds

Support calendar subscription URLs.

The canonical default feed for a team should be human-readable.

Examples:

```text
https://sportscal.site/calendar/nfl/pittsburgh-steelers.ics

https://sportscal.site/calendar/nba/oklahoma-city-thunder.ics

https://sportscal.site/calendar/ncaaf/oklahoma-sooners.ics
```

These canonical URLs use SportsCal's default configuration.

They do not require a database record.

---

# 32. Custom subscription feeds

When someone changes templates/settings and wants those custom settings to remain in a subscription, save an anonymous calendar configuration.

Use URLs similar to:

```text
https://sportscal.site/calendar/ncaaf/oklahoma-sooners/{publicId}.ics
```

Do not cram templates into query parameters.

The public ID should be short enough to share but unguessable enough to avoid trivial enumeration.

Use Nano ID or secure random bytes.

---

# 33. No user accounts

There must be:

- no signup
- no login
- no OAuth
- no user profiles

The product should remain lightweight.

Custom calendar configuration records contain no personally identifying information.

---

# 34. Anonymous editing model

Allow someone to update a saved custom subscription without accounts.

When a custom calendar is created:

1. Generate a `publicId`.
2. Generate a cryptographically secure `editToken`.
3. Store only a hash of the edit token in the database.
4. Return the edit token once to the browser.
5. Save it locally in the user's browser.
6. Require it for PATCH/DELETE operations.

Never expose the edit token in the public `.ics` URL.

A manage URL may use a fragment such as:

```text
https://sportscal.site/manage/{publicId}#token=SECRET
```

A URL fragment is preferable to a query parameter because it is not sent to the server as part of the HTTP request.

The management UI should immediately read/store the token and avoid unnecessarily exposing it.

Someone who loses the edit token can still use the calendar feed but cannot modify that saved configuration. They can create a new one.

This is acceptable because there are deliberately no accounts.

---

# 35. Subscription dialog

When users click:

**Create subscription**

show a polished Dialog.

After saving, display:

## Calendar URL

```text
https://sportscal.site/calendar/...
```

Actions:

- Copy subscription URL
- Open/subscribe with Apple Calendar
- Copy `webcal://` equivalent
- Download current `.ics`

Include concise instructions for services that require pasting a calendar URL.

Do not make this dialog overly verbose.

---

# 36. Database schema

Use PostgreSQL + Drizzle.

A primary table can look approximately like:

```text
calendar_configs

id
public_id
edit_token_hash

league
team_id
team_slug

season_mode
season_override

include_preseason
include_regular_season
include_postseason

calendar_name_template
title_template
description_template
location_template

duration_minutes
busy_status
include_espn_url

overrides_json

created_at
updated_at
last_accessed_at
```

JSONB is appropriate for sparse per-game overrides.

Use proper indexes for:

```text
public_id
team_slug
league
```

Don't store entire ESPN schedule responses permanently unless there is a clear operational reason.

---

# 37. Configuration shape

Create a reusable typed configuration model approximately like:

```ts
interface CalendarConfig {
  league: LeagueKey
  teamId: string
  teamSlug: string

  seasonMode: "auto" | "manual"
  seasonOverride?: number | string

  include: {
    preseason: boolean
    regularSeason: boolean
    postseason: boolean
  }

  templates: {
    calendarName: string
    title: string
    description: string
    location: string
  }

  durationMinutes: number

  busyStatus: "free" | "busy"

  includeEspnUrl: boolean

  overrides: Record<string, GameOverride>
}
```

Use Zod to validate everything coming from the client or database.

---

# 38. API/backend structure

A sensible organization would include routes similar to:

```text
/api/leagues
/api/teams
/api/schedule
/api/calendars
/api/calendars/[publicId]
```

and public feed routes:

```text
/calendar/[league]/[team].ics

/calendar/[league]/[team]/[publicId].ics
```

Exact route structure may differ if Next.js routing makes another clean structure more appropriate.

Keep public ICS GET routes simple and cacheable.

---

# 39. ESPN caching

This is a public website using an undocumented external API.

Do not unnecessarily hammer ESPN.

Use server-side caching/revalidation.

Reasonable starting points:

## Team catalogs

Revalidate every:

```text
24 hours
```

## League/season metadata

Approximately:

```text
6-12 hours
```

## Active schedules

Approximately:

```text
15 minutes
```

## Offseason schedules

Can be longer.

Use Next.js server fetch caching/revalidation where practical.

Public `.ics` endpoints should emit reasonable cache headers, for example using a short CDN freshness period with stale-while-revalidate.

The feed should remain fresh enough for sports schedule changes without requesting ESPN on every calendar client's request.

---

# 40. Resilience

If ESPN temporarily fails:

- show a clear non-scary error in the builder
- keep existing settings intact
- provide Retry
- do not crash the entire page
- cached schedule/team data should remain usable where possible

Design:

- loading states
- skeleton states
- empty states
- error states
- no-schedule-published state

Do not leave dead ends.

---

# 41. API response changes

Because ESPN's API is undocumented, isolate assumptions.

Use small mapping functions such as:

```ts
normalizeTeam()
normalizeGame()
normalizeSeason()
normalizeBroadcasts()
normalizeVenue()
```

Use optional chaining/validation for noncritical fields.

A missing broadcast network should never prevent a calendar from generating.

A missing venue should simply produce a blank location.

---

# 42. Per-league behavior

Avoid three mostly duplicated implementations.

Use a league registry/configuration and shared adapters whenever possible.

League-specific behavior should be small configuration differences.

Example:

```ts
const leagueConfig = {
  nfl: {...},
  nba: {...},
  ncaaf: {...}
}
```

This should make adding NHL, MLB, NCAAM, etc. straightforward later.

---

# 43. Calendar preview schedule list

After fetching a team, display its schedule in a compact polished list/table.

Each row can contain:

- date
- time / TBD
- opponent
- home/away
- game type
- broadcast
- venue
- event template preview
- overflow edit menu

Use badges sparingly.

Clearly distinguish:

`vs`

and:

`@`

Use tabular numbers/Geist Mono for dates and start times where appropriate.

---

# 44. Advanced settings

Keep uncommon settings behind a collapsible section.

Potential controls:

- manual season override
- event duration
- Free vs Busy
- include ESPN source URL
- show all NCAAF teams
- reset template settings
- perhaps calendar refresh-related information

Do not overwhelm first-time users.

---

# 45. URL state

Where sensible, preserve simple initial selections in URL state.

For example:

```text
/?league=ncaaf&team=oklahoma-sooners
```

Do not encode an entire custom template configuration into the URL.

This enables useful deep links while keeping URLs readable.

---

# 46. Browser persistence

Use localStorage for convenience only.

Examples:

- last league
- last team
- recently edited custom calendars/edit tokens
- unsaved builder state

The application must not rely on localStorage for the actual public subscription feed configuration.

Saved feeds belong in PostgreSQL.

---

# 47. Security

This is a public anonymous service.

Implement basic protections.

## Validate inputs

Use Zod.

Limit template lengths.

Limit description lengths.

Limit the number/size of event overrides.

## No arbitrary code

Templates are string substitution only.

Never use:

```ts
eval()
new Function()
```

## No arbitrary upstream URLs

ESPN endpoints must be assembled from the known league registry.

Do not allow users to provide arbitrary fetch URLs.

This prevents SSRF.

## Editing

Hash edit tokens.

Use constant-time comparison where applicable.

## Rate limiting

Rate-limit configuration creation/update endpoints by IP or equivalent mechanism.

A reasonable default could be something like 20 anonymous creations per hour per IP, configurable through environment variables.

Public `.ics` GET requests should be cacheable and treated differently.

---

# 48. Privacy

Do not collect unnecessary user information.

No account system.

No email addresses.

No ad trackers.

No third-party analytics should be required for core operation.

If analytics are included at all, keep them privacy-conscious and easy to disable.

---

# 49. Attribution/disclaimer

Add a discreet footer.

Something similar to:

```text
Schedule data sourced from ESPN public endpoints.
SportsCal is not affiliated with or endorsed by ESPN or the leagues/teams listed.
```

Do not make the site appear official.

---

# 50. Team logos

If ESPN supplies a team logo URL, it may be shown in the selector/preview.

Treat logos as optional decorative data.

A broken logo must never break the UI.

Always show the team name.

Do not make SportsCal's own branding look like an ESPN or league product.

---

# 51. Accessibility

Implement normal accessibility standards.

All interactive controls must work with keyboard navigation.

Include:

- visible focus states
- labels for inputs
- accessible combobox behavior
- accessible dialogs
- sufficient contrast
- appropriately sized touch targets
- text labels in addition to ambiguous icons

Do not use color alone to communicate a game state.

---

# 52. Responsive behavior

Test at minimum:

- phone
- tablet
- standard laptop
- wide desktop

The builder and schedule preview should reflow rather than creating horizontal page overflow.

Tables may become list/card representations on narrow screens.

---

# 53. Performance

Aim for a fast utility site.

Avoid:

- enormous JS bundles
- unnecessary client components
- global client-side state libraries
- excessive animation
- huge image assets

Prefer server components for mostly static/server-fetched areas.

Only make interactive sections client components.

---

# 54. Testing

Create meaningful automated tests.

## Unit tests

Test:

- template substitution
- missing template variables
- home/away formatting
- season type normalization
- stable UID generation
- event duration
- event filtering
- TBD time handling
- override merging
- config validation

## Season tests

Include explicit season/offseason cases for:

- NFL
- NBA
- NCAAF

Especially test NBA's cross-calendar-year season behavior.

## ESPN adapter tests

Store small sanitized fixture responses so ordinary test runs do not depend on ESPN being online.

Use fixture examples for:

- Pittsburgh Steelers
- Oklahoma City Thunder
- Oklahoma Sooners

Do not run live ESPN calls in the normal deterministic test suite.

A separate optional integration test can test live endpoints.

## ICS tests

Generate a calendar and verify:

- VCALENDAR exists
- expected number of VEVENTs
- stable UIDs
- expected DTSTART
- expected DURATION/DTEND
- SUMMARY
- DESCRIPTION escaping
- LOCATION escaping
- all-day TBD events
- cancellation behavior

Ideally parse the resulting `.ics` through an independent parser in tests to ensure validity.

## E2E

At minimum test:

1. Select NFL → Steelers → generate schedule → download.
2. Select NBA → Thunder → customize title template.
3. Select NCAAF → Oklahoma → FBS team picker.
4. Save custom subscription → retrieve `.ics`.
5. Modify custom calendar using edit token.
6. Exclude an individual game.
7. Mobile basic builder flow.

---

# 55. Loading experience

Use stable skeletons matching final component sizes.

Do not use giant centered spinners for everything.

Examples:

- team list loading: skeleton combobox
- schedule loading: several schedule row skeletons
- save subscription: button spinner + disabled state

---

# 56. Notifications

Use shadcn/Sonner-style toast notifications for small actions:

```text
Calendar URL copied
Calendar saved
Download ready
Override reset
Unable to reach ESPN
```

Avoid excessive toast spam.

---

# 57. Suggested component structure

Use a structure resembling:

```text
components/
  layout/
    site-header.tsx
    site-footer.tsx

  builder/
    sports-calendar-builder.tsx
    league-selector.tsx
    team-picker.tsx
    season-selector.tsx
    game-type-options.tsx
    template-editor.tsx
    variable-picker.tsx
    calendar-settings.tsx
    advanced-settings.tsx

  schedule/
    schedule-preview.tsx
    schedule-event-row.tsx
    event-preview.tsx
    event-override-dialog.tsx

  subscription/
    subscription-dialog.tsx
    calendar-url.tsx

  ui/
    ...shadcn components
```

Adjust when there is a better clean abstraction.

---

# 58. Suggested server organization

Something similar to:

```text
lib/
  espn/
  calendar/
    generator.ts
    templates.ts
    uid.ts
    filters.ts
    overrides.ts
  db/
    schema.ts
    client.ts
  config/
    leagues.ts
  validation/
  utils/
```

Avoid giant multi-thousand-line files.

---

# 59. Error copy

Use direct useful messages.

Good:

```text
ESPN hasn't published Oklahoma's next season schedule yet.
```

Good:

```text
We couldn't refresh this schedule from ESPN. Try again in a moment.
```

Avoid:

```text
Something went wrong.
```

when more useful context is available.

---

# 60. Empty offseason state

If SportsCal determines that the upcoming season is the correct one but ESPN hasn't published games yet, display:

```text
The upcoming schedule hasn't been published yet.
```

Explain that subscription feeds can populate automatically once games become available.

Do not quietly show an old season and imply it is upcoming.

---

# 61. Calendar updates

The subscription feed must regenerate from current ESPN data.

Do not store a frozen copy of the event list when creating a subscription.

Persist:

- user's calendar configuration

not:

- permanent schedule output

When the `.ics` URL is requested:

1. load config
2. resolve correct season if set to auto
3. fetch/retrieve cached ESPN schedule
4. apply filters
5. apply global templates
6. apply per-event overrides
7. generate current ICS

This is what lets postseason games and schedule changes appear automatically.

---

# 62. Auto-season subscriptions across years

A custom subscription configured with:

```text
seasonMode = auto
```

should continue working the following year.

Example:

A Pittsburgh Steelers subscription created in 2026 should eventually move to the 2027 Steelers schedule automatically when ESPN considers that the appropriate active/upcoming season.

This is preferable to requiring a new subscription URL every season.

Canonical feeds always operate this way.

Manual season override feeds remain pinned.

---

# 63. Managing old events when season rolls over

Do not accidentally mix two unrelated full seasons in one feed.

For auto-season feeds, expose the currently resolved season's schedule.

It is acceptable for calendar clients to retain already-imported historic events depending on client behavior, but the feed itself should represent the currently resolved season.

Document this behavior.

---

# 64. Feed cache headers

For `.ics` subscription responses use:

```text
Content-Type: text/calendar; charset=utf-8
```

Use `inline` rather than forced attachment for subscription endpoints.

Provide sensible cache directives, for example around 15 minutes in CDN/server cache with stale-while-revalidate.

Do not set year-long immutable caching.

Schedule changes matter.

---

# 65. Canonical download vs subscription routes

Keep the concepts distinct.

**Download button**

Produces a snapshot.

**Subscription URL**

Produces current dynamic data on every refresh/cache cycle.

The UI should clearly explain this difference in one sentence:

```text
Download is a snapshot. Subscription URLs update when the schedule changes.
```

---

# 66. README

Create a strong open-source README.

Include:

- SportsCal description
- screenshot placeholder or generated project screenshot if practical
- supported leagues
- major features
- stack
- local development
- environment variables
- PostgreSQL setup
- migrations
- running tests
- production deployment
- Vercel instructions
- adding another league
- ESPN endpoint disclaimer
- license

Include example URLs for generated feeds.

---

# 67. Environment configuration

Provide `.env.example`.

At minimum:

```text
DATABASE_URL=
NEXT_PUBLIC_APP_URL=https://sportscal.site
```

Add other variables only when actually required.

Local default:

```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Do not hardcode production origin in logic where an environment variable is more appropriate.

---

# 68. Database migrations

Include Drizzle configuration and migrations.

A fresh developer should be able to:

```bash
pnpm install
```

configure the environment, run the DB migration command, then:

```bash
pnpm dev
```

and have a functioning application.

Document the exact commands.

---

# 69. Local PostgreSQL

For developer convenience, include a simple Docker Compose PostgreSQL configuration unless there is a compelling reason not to.

Example goal:

```bash
docker compose up -d
pnpm db:migrate
pnpm dev
```

Production can use any standard hosted PostgreSQL provider compatible with the configured driver.

Do not tightly couple the application to one proprietary database vendor.

---

# 70. CI

Add GitHub Actions that run on push/PR:

- install
- lint
- typecheck
- unit/integration tests
- production build

Keep CI straightforward.

---

# 71. Code quality

Requirements:

- no TypeScript `any` unless there is a documented unavoidable boundary
- no disabled linting just to make errors disappear
- no fake/mock production data
- no hardcoded team schedule
- no giant client component containing the entire app
- no repeated raw ESPN fetch logic
- no secret values committed
- no broken TODO placeholders for required functionality

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

before considering the project complete.

Fix all relevant errors.

---

# 72. Initial default examples

Use real fetched data, but these are useful development targets:

## NFL

Pittsburgh Steelers

## NBA

Oklahoma City Thunder

## NCAAF

Oklahoma Sooners

Make sure all three work end-to-end.

---

# 73. Product details to preserve

These requirements are intentional:

- Public project
- No user accounts
- ESPN API data
- NFL/NBA/NCAAF only for v1
- Automatic season detection
- Upcoming season during offseason
- FBS default for NCAAF
- Show all college teams option
- NCAAF grouped by conference
- Global templates are the primary customization model
- Per-game overrides are secondary
- Default description is blank
- Actual venue is default location
- Preseason OFF
- Regular season ON
- Postseason ON
- NFL duration 3h30
- NCAAF duration 3h30
- NBA duration 2h30
- Both downloads and subscriptions
- Subscription feeds dynamically update
- sportscal.site is the production domain
- Vercel-inspired dark design
- shadcn/ui
- No promotional event-description clutter

Do not silently change these defaults.

---

# 74. Future extensibility

Do not implement these leagues now, but architect the league registry so later support for things such as:

- NHL
- MLB
- NCAAM
- WNBA
- MLS

does not require redesigning the application.

Likewise, template variables should come from the normalized SportsCal game model rather than league-specific UI code.

---

# 75. Suggested v1 homepage behavior

On first visit:

```text
SportsCal

Clean sports schedules for your calendar.

[ NFL ] [ NBA ] [ NCAAF ]

Team
[ Search teams... ]
```

Once a team is selected, transition naturally into:

```text
Oklahoma Sooners
2026 season · 12 games

Include
[x] Regular Season
[x] Postseason
[ ] Preseason

Event title
{team} {homeAwaySymbol} {opponent}

Description
[ blank ]

Location
{venue}

[ Advanced settings ]

Preview
...
```

Bottom/sticky actions:

```text
Download .ics
Create subscription
```

This should feel fast and obvious without needing a tutorial.

---

# 76. Final verification

Before finishing, perform a complete product review.

Verify:

### Data

- NFL schedule loads
- NBA schedule loads
- NCAAF schedule loads
- NCAAF FBS filtering works
- conference grouping works
- automatic season resolver behaves correctly
- NBA season labels are correct

### Calendar

- file imports successfully
- events have correct dates/times
- titles are correct
- home/away is correct
- venues are correct
- descriptions are clean
- durations are correct
- TBD times don't become fake noon/midnight events
- UIDs are stable

### Subscription

- canonical URL works
- custom URL works
- feed updates use saved templates
- edit token works
- unauthorized edit fails
- custom event overrides persist
- auto season mode survives year rollover

### UI

- desktop
- mobile
- loading
- errors
- empty schedule
- dark theme
- keyboard navigation

### Engineering

- lint passes
- typecheck passes
- tests pass
- production build passes

---

# 77. Deliverable

Finish with a fully runnable repository.

Do not merely write an implementation plan.

Implement:

- the application
- database schema
- ESPN client
- season resolver
- templates
- calendar generator
- downloads
- subscription feeds
- anonymous saved configs
- editing
- responsive UI
- tests
- README
- environment template
- migrations
- CI
- deployment configuration

At the end, provide a concise summary covering:

1. what was built
2. important architecture choices
3. exact local setup commands
4. required environment variables
5. how to deploy to Vercel and point `sportscal.site` at it
6. URLs/routes worth testing
7. any ESPN API limitations discovered during real endpoint testing

Do not leave core requested features as future work.