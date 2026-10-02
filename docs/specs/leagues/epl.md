# English Premier League (`epl`)

Status: draft. League key `epl`, label "Premier League", ESPN `soccer/eng.1`.
Depends on the shared league-dropdown prerequisite in [README.md](./README.md) (not re-specced here).
First soccer league, built alongside [mls.md](./mls.md). Items marked **soccer-shared (also MLS)** are built once, by whichever league lands first.

## 1. Summary, goals, non-goals

Add the Premier League as a fourth league: pick a club, get a subscribable `.ics` of that club's 38 league fixtures, same builder, preview, saved-calendar and feed behaviour as the existing leagues.

Goals
- Club picker with all 20 current clubs, resolved per season (promotion/relegation).
- Complete season: played results and upcoming fixtures both appear, including draws and moved/TBD fixtures.
- Soccer-appropriate defaults: "Home v Away" title, ~2 h duration, Europe/London schedule zone, no preseason/postseason chips.
- Existing saved calendars and UIDs for other leagues are unaffected.

Non-goals (v1)
- **Domestic cups and European competitions (FA Cup, Carabao Cup, Champions League, Europa League, ...).** Verified below: the `eng.1` team schedule is league-only. Cups live under separate ESPN leagues (`eng.fa`, `eng.league_cup`, `uefa.champions`, `uefa.europa`) with their own season ids and round-based season types, and a club's participation is per-season and dynamic. Supporting them needs a multi-league-per-calendar model (registry, UID scope, filter chips, per-competition templates). The README promises "my team's fixtures", so the builder/about copy must say plainly "Premier League fixtures only" (see 4.9). Follow-up spec: "competitions" as an include option.
- Matchweek numbers (not in the team-schedule payload, see 2).
- Live scores/in-play updates, lineups, standings.
- Women's/lower leagues.

## 2. ESPN data findings (verified live, 2026-10-02)

Base URLs as in `lib/espn/client.ts`: site `.../apis/site/v2/sports/soccer/eng.1`, core `.../v2/sports/soccer/leagues/eng.1`.

**Season (core)**
- `GET core/season` -> `year: 2026`, `displayName: "2026-27 English Premier League"`, `abbreviation: "2026-27"`, `startDate 2026-06-01T04:00Z`, `endDate 2027-06-01T03:59Z`. ESPN `year` is the **start** year (2026 = 2026-27); NBA's `year` is the end year, so never assume.
- The current-season payload has a singular `type` object and **no `types.items`**; `espnSeasonSchema` therefore yields `types: []`. `seasonPhase()` falls back to season start/end dates, which works.
- `GET core/seasons/2026` and `/2025` (and back to 2002) return `types.items` with exactly **one** type: `id "1"`, `name "2026-27 English Premier League"`, `abbreviation` = same long name (older seasons: `"2018/2019 English Premier League"`). There is no preseason/regular/postseason split. `seasons/2027` -> 404 `no instance found`.
- `core/seasons/2026/types/1/events?limit=1` -> `count: 380` (20 x 19). `types/2/events` -> `count: 0`. `fetchSeasonEventCount()` hardcodes type `2`, so for soccer it always returns 0.
- Season window ends 1 Jun, after the final matchday (30 May), so "active" lasts until the season is truly over; next season starts `1 Jun` (pre-season is "active" by the window, which is acceptable: fixtures publish in June).

**Teams (site `/teams?limit=1000`)**
- 20 clubs, all `isActive: true`. 2026-27 includes promoted Coventry City (388), Hull City (306), Ipswich Town (373); Wolves (380) is gone.
- `teams?season=2025` is **ignored** (returns the current 20). There is no per-season roster via this endpoint.
- Payload: `slug` like `eng.man_city` / `eng.aston_villa` (dot + underscore), `name` is **absent**, `nickname` is the club nickname ("Reds"; Newcastle `"Magpies/Toon"`), `location` = full club name ("AFC Bournemouth"), `shortDisplayName` ("Man City"), `abbreviation` ("MNC" for Man City, "NFO", "AVL", "BOU"; ESPN's codes, not always the usual TLAs), `color` present, `logos` include `default` and `dark` rels.
- `GET .../groups` -> one node `{name: "2026-27 English Premier League", abbreviation: "2026-2027"}` with **no `teams` or `children`**. `GET apis/v2/.../standings` (no `group` param) -> one child with `standings.entries` (20), no `isConference`. So neither endpoint yields conference/division; the league is a flat table.
- Old (relegated) clubs still resolve by id: `GET teams/380` works; `teams/380/schedule?season=2025` -> 38 events; `season=2026&fixture=true` -> 0 events.

**Team schedule (`teams/{id}/schedule`) - the big quirk**
- Default response (`?season=2026`, also with `seasontype=1`) returns **only completed matches** (`STATUS_FULL_TIME`), newest first: Liverpool 5 events. Upcoming fixtures are **omitted**.
- `?season=2026&fixture=true` returns **only upcoming** matches (`STATUS_SCHEDULED`): Liverpool 33. 5 + 33 = 38, no overlap, no gaps. Cross-checked across all 20 clubs: 380 unique event ids.
- `fixture=true` **ignores `season`**: `season=2025&fixture=true` and `season=2027&fixture=true` both return the 2026 fixtures with `requestedSeason.year: 2026`. `buildGames()` already discards responses whose `requestedSeason.year` mismatches, so this is safe as long as the check stays.
- `seasontype` is effectively ignored: `1` equals default; `2` returns 0 events; `season=2027` (default) returns 0 events with `requestedSeason: null`.
- Past seasons (2023-2025, all 20 clubs): default returns all 38 matches; 1,824 events, all `STATUS_FULL_TIME`; no postponed/cancelled/`timeValid:false` events found in those sample sets.
- Every event: `seasonType.id "1"` (name = long season name), `season.year` start year, no `week`, no `competitions[0].notes` (cups have notes like "Liverpool advances."), `neutralSite false`, `venue.fullName` + `address.city` + `address.country: "England"` (**no `state`**).
- Competitor `score` is an object with `displayValue`/`value` plus `$ref` etc. (parses fine under `espnCompetitorSchema`). Draws: both competitors `winner: false`.
- Broadcasts are **US region** (`media.shortName`: USA Net, Peacock, Tele, Universo, NBC, NBCSN), empty for most future fixtures. No UK broadcasters (Sky/TNT) are returned. `?region=gb` not tested (open question).
- Event `name` is "Liverpool at AFC Bournemouth" and `shortName` "LIV @ BOU" (US-style "at"); status `detail` for future matches is a US Eastern string ("Sun, October 11th at 11:30 AM EDT").
- Times: all verified future fixtures have `timeValid: true`. Saturday fixtures sit at exactly 15:00 UK (14:00Z BST / 15:00Z GMT), the traditional blackout slot, so many far-future times are probably **provisional placeholders**; TV picks move them 4-6 weeks out. No TBD example exists in the current data (0 of 760 team-schedule events had `timeValid:false` or "TBD" detail), so ESPN's TBD representation for soccer is **unverified**.
- Not verified: shape of in-progress (`STATUS_FIRST_HALF`, `STATUS_HALFTIME`...), postponed (`STATUS_POSTPONED`) and abandoned matches; behaviour of `fixture=true` for a match currently in play.

**Other competitions**: `site/soccer/eng.fa|eng.league_cup|uefa.champions/teams/364/schedule` return Liverpool's cup events (e.g. FA Cup R4/R5/QF with `seasonType.name` = round, Carabao R3 on 2026-09-15, UCL league phase 2026-09-09); `uefa.europa` returns 0 for Liverpool. Confirms cups are separate and out of scope.

**Parse check**: the unmodified schemas in `lib/espn/schemas.ts` parse live team, season, results and fixtures responses, and `normalizeGame()` produces valid games for all of them. Problems are semantic, not structural (4.1-4.6).

## 3. Config entry

New/changed `LeagueConfig` fields are all optional or additive so existing entries compile unchanged. `LEAGUE_KEYS` becomes `["nfl","nba","ncaaf", ..., "epl"]` (position per README ordering).

```ts
// lib/config/leagues.ts
export type TeamGroupingSource =
  | { kind: "groups" }
  | { kind: "standings"; defaultGroupIds: string[]; extendedGroupIds: string[] }
  | { kind: "flat" };                       // NEW, soccer-shared: no conferences/divisions

export interface LeagueConfig {
  // ...existing...
  /**
   * NEW, soccer-shared. Query-param sets issued per team schedule fetch, merged
   * and de-duplicated. Default (omitted) = one request per scheduleSeasonTypes entry.
   * Soccer needs results + fixtures because ESPN splits them.
   */
  scheduleQueries?: Record<string, string | number | boolean>[];
  /** NEW, soccer-shared. Type id used by fetchSeasonEventCount (default 2). */
  regularSeasonTypeId?: number;
  /** NEW, soccer-shared. Which Include chips the builder offers (default all three). */
  gameTypes?: ("preseason" | "regular" | "postseason")[];
  /** NEW, soccer-shared. Default templates (default DEFAULT_TEMPLATES). */
  defaultTemplates?: Partial<Record<TemplateField, string>>;
  /** NEW, soccer-shared. Letter/word for a drawn result in {result} (default "T"). */
  drawLabel?: string;
}

epl: {
  key: "epl",
  sport: "soccer",
  league: "eng.1",
  label: "Premier League",
  name: "English Premier League",
  defaultDurationMinutes: 120,
  scheduleSeasonTypes: [1],
  scheduleQueries: [{ seasontype: 1 }, { seasontype: 1, fixture: true }],
  regularSeasonTypeId: 1,
  seasonTypeFallback: { "1": "regular" },   // ESPN's only type; its name is the season title
  gameTypes: ["regular"],
  teamGrouping: { kind: "flat" },
  scheduleTimeZone: "Europe/London",
  hasWeeks: false,
  drawLabel: "D",
  defaultTemplates: {
    title: "{homeTeam} v {awayTeam}",
    calendarName: "{team} Premier League {season}",
  },
},
```

Notes
- `seasonTypeFallback {"1":"regular"}` is required. Without it, `normalizeSeasonType()` sees the long season name (not "regular season"), then falls to the `"1"` entry; NFL's table maps `1` to "preseason", so the whole season would be filtered by the "Preseason" chip.
- `defaultDurationMinutes: 120` (90 min + stoppage; HT excluded from typical calendars). Users can change it.
- `hasWeeks` is currently unused in the codebase (only declared); set `false`, do not add new behaviour for it.
- EPL is a flat league: `teamGrouping.kind === "flat"` makes `getTeamCatalog()` skip `/groups` and `/standings` entirely (2 fewer requests, no false failure when those return empty groups).

## 4. Code changes beyond config

### 4.1 Team slug normalization - **soccer-shared (also MLS)**
`normalizeTeam()` (`lib/espn/normalize.ts`) uses `raw.slug` verbatim. ESPN soccer slugs are `eng.man_city`, which fail `SLUG_RE` (`^[a-z0-9-]{1,100}$`) in `app/calendar/[league]/[...path]/route.ts` and `teamSlug` in `lib/validation/calendar-config.ts`, so every feed URL would 404 and saved calendars would fail validation.
Change: for leagues with `sport === "soccer"` (or generally), derive `slug = slugify(displayName)` ("manchester-city", "brighton-and-hove-albion", "aston-villa") and keep ESPN's raw slug out of URLs. Ensure uniqueness within the catalog (append `-${id}` on collision). Do not change slug derivation for existing leagues. Slugs must be stable across seasons (club name changes are rare; ESPN displayName is the source). Team ids stay the identity (`teamId` in saved calendars, UID scope).
Also correct `name`: `normalizeTeam()` already falls back `raw.name ?? raw.nickname`, giving "Reds"; for soccer prefer `shortDisplayName`/`displayName` so `{teamFull}`/`name` do not read as nicknames. `normalizeGameTeam()` same.

### 4.2 Schedule fetch: results + fixtures - **soccer-shared (also MLS)**
`fetchTeamGames()` (`lib/espn/schedules.ts`) iterates `league.scheduleSeasonTypes`. Change to iterate `league.scheduleQueries ?? scheduleSeasonTypes.map(seasontype => ({seasontype}))`, passing each set as query params alongside `season`. `buildEspnUrl` already accepts a query record; extend value type to `boolean` and serialize via `String(...)`. `buildGames()` (merge by event id, `requestedSeason` check) needs **no change**; the check is what safely drops the 2026 fixtures returned for `season=2025&fixture=true` and for an unpublished next season. Cache tag unchanged. For a completed season skip the `fixture=true` request (saves one fetch; optional).
Revalidate: keep `REVALIDATE.activeSchedule` (15 min); for soccer this is the main defence against stale provisional times (see 5).

### 4.3 Season resolution - **soccer-shared (also MLS)**
- `fetchSeasonEventCount()` (`lib/espn/seasons.ts`): use `league.regularSeasonTypeId ?? 2` for `/types/{id}/events` (soccer = 1; verified count 380).
- Normalized season display label: `normalizeSeason()` uses `raw.displayName`, producing `{season}` = "2026-27 English Premier League", so the default calendar name becomes "Liverpool 2026-27 English Premier League Schedule". Add `abbreviation` to `espnSeasonSchema` and prefer it when it matches `^\d{4}(-\d{2,4})?$` ("2026-27"); else strip a trailing league name; else `displayName`. The same rule also applies to event `season.displayName` in `normalizeGame()`. MLS's `year` display is likely "2026 Major League Soccer" - same fix. NFL/NBA/NCAAF unaffected (their displayName already matches).
- Schema: current-season payload lacks `types.items`; already tolerated. No change.
- `listSeasonOptions()` (5 seasons back) works: `seasons/{year}` exists back to 2002; `espnSeason` = start year, label "2025-26".

### 4.4 Flat team grouping - **EPL-only usage** (`flat` kind is generic; MLS uses `groups`/`standings` for conferences)
- `lib/espn/teams.ts` `loadCatalog()`: add `kind === "flat"` branch: `membership = new Map()`; `buildCatalog()` sets `tier: "primary"` for `flat` the same way it does for `groups`.
- `CatalogTeam`/`SportsCalTeam` `conference`/`division` stay undefined. Team picker (`components/builder/team-picker.tsx`) already tolerates missing `conference` (it only adds it to the search haystack); no change. Confirm no UI renders an empty conference label (checked: none). Because the 20 clubs are one flat list, no "Show all teams" toggle should appear (`/api/teams` `all=1` returns the same list).
- Search: `searchTeams()` already matches `shortName` ("Man City"), `displayName` and ESPN `abbreviation` ("MNC"). Common aliases ("Spurs", "Man Utd") are not covered; see open questions.
- `getTeamCatalog` cache key `espn-team-catalog-v1`: bump to `-v2` in the same PR so stale catalogs from before the new `LeagueKey`/slug logic are not served.

### 4.5 Templates and variables - **soccer-shared (also MLS)**
`lib/calendar/templates.ts`:
- `DISPLAY_TZ` is hardcoded `America/New_York` and the variable descriptions say "(Eastern Time)". Change `formatDate`/`formatTime` to take the league's `scheduleTimeZone` (via `LEAGUES[game.league]`). NFL/NBA/NCAAF are all `America/New_York`, so output is unchanged for them; EPL renders `{time}` as "3:00 PM GMT/BST". Update descriptions to "in the league's time zone". Calendar clients still localize the actual event start (feeds are UTC), so only the text variables use this.
- `resultLabel()`: draws render "T 1-1"; soccer expects "D 1-1". Use `LEAGUES[game.league].drawLabel ?? "T"`.
- `{homeAway}` / `{homeAwaySymbol}`: unchanged. Default soccer title uses the new `{homeTeam} v {awayTeam}` (variables already exist) so UK convention (home first, `v`) is the default for both clubs' calendars. Users may still choose `{team} {homeAwaySymbol} {opponent}`.
- `{venueFull}` is "Anfield, Liverpool" (no state; fine). `{state}` is empty for UK venues. `{week}`, `{note}` are empty. No new variables required; optionally hide `week` in the picker for `hasWeeks: false` leagues (cosmetic, not required).
- `defaultConfig()` (`lib/validation/calendar-config.ts`): merge `LEAGUES[league].defaultTemplates` over `DEFAULT_TEMPLATES`. `isDefaultConfig()` already compares against `defaultConfig()`, so canonical-feed detection stays correct. No schema change to `calendarConfigSchema` (templates are free strings).
- `eventUid`, ICS generator (`lib/calendar/generator.ts`), `events.ts`: **none**. TBD/postponed handling already maps to all-day/tentative (see 5).

### 4.6 Normalize / game model - **soccer-shared (also MLS)**
- `normalizeGame()` needs no structural change. Two small ones: (a) `normalizeStatus()` handles `POSTPONE`/`CANCEL`; soccer also uses `STATUS_ABANDONED`/`STATUS_SUSPENDED` (unverified): treat unknown non-`pre|in|post` names as-is, add `ABANDON`/`SUSPEND` -> `postponed` mapping only after verifying the shape (open question). (b) `dateInZone()` uses `league.scheduleTimeZone` - set to Europe/London so a TBD placeholder at 00:00 UK local maps to the right calendar day (ESPN publishes TBD as midnight in the schedule zone, per the config comment; unverified for soccer).
- No change to `SportsCalGame` fields for EPL. `week` stays undefined.

### 4.7 Game-type options / builder - **soccer-shared (also MLS)**
`components/builder/game-type-options.tsx` always shows Regular season / Postseason / Preseason; `sports-calendar-builder.tsx` (~line 166) computes counts for all three. For EPL, preseason and postseason are always 0 and meaningless.
Change: pass the league's `gameTypes` to `GameTypeOptions` and render only listed options; if only one type is available, hide the whole "Include" fieldset (nothing to choose). Keep stored `include` as all-true so `isSeasonTypeIncluded()` (`lib/calendar/filters.ts`) never drops EPL games. Expose `gameTypes` via `/api/leagues` (`app/api/leagues/route.ts`) and the client league type. `calendarConfigSchema.include` unchanged. MLS will want `["regular","postseason"]` (Leagues Cup/playoffs), so this must be array-driven.

### 4.8 Relegated clubs and saved calendars - **soccer-shared (also MLS)**
Team catalog is current-season only (ESPN `/teams` ignores `season`). After relegation (e.g. Wolves, id 380, not in 2026-27):
- Canonical feed `/calendar/epl/wolverhampton-wanderers.ics` -> `findTeam()` misses -> 404 "Unknown team". Accepted for canonical URLs (the club is not in the league); the builder simply no longer lists them.
- Saved calendars (`lib/db`, `calendar_configs`): rows keep `league`, `teamId`, `teamSlug`; the `/calendar/epl/{slug}/{publicId}.ics` route still calls `findTeam(config.teamSlug)`. A subscriber to a relegated club must not get a 404 (clients show errors / may drop the calendar). Change: when resolving a saved calendar, fall back from the catalog to a direct `GET teams/{teamId}` (works for relegated clubs, verified for Wolves) and build a `SportsCalTeam` from it; the schedule for the new season is then empty and the feed serves a valid empty calendar named for the club (or, with `seasonMode: "manual"`, the chosen past season). Do not delete calendars automatically.
- Manage page (`app/manage`) should show nothing special; optionally label "Not in the {season} Premier League" when the fallback was used (nice-to-have).
- Promoted clubs: appear automatically when ESPN publishes the next season's `/teams` (verified: Coventry/Hull/Ipswich present now). Slug uniqueness (4.1) must hold with promotions.
- DB schema: **none** (`league varchar(16)` fits "epl"; `teamSlug varchar(100)`, `teamId` regex `^[0-9]{1,10}$` fits ids like 388).

### 4.9 UI copy and metadata - **EPL-only text, soccer-shared plumbing**
- `app/layout.tsx` meta description ("Pick an NFL, NBA, or college football team...") -> league-neutral ("Pick a team from the NFL, NBA, college football, Premier League and more...").
- `app/about/page.tsx`: ESPN data note should add that EPL calendars cover Premier League matches only, not cups or European fixtures; kick-off times can change when TV selections are made and update on the next refresh.
- Builder: show a one-line hint under the team picker when league is `epl`/soccer: "Premier League matches only." Data-driven via a `LeagueConfig.note?: string` or inline per key (decide in implementation; prefer config so MLS reuses).
- `tests`/placeholders that mention "Steelers/Thunder/Sooners" examples are untouched.

### 4.10 Route validation and API
- `app/calendar/[league]/[...path]/route.ts`: no change beyond 4.1 (slug now matches `SLUG_RE`) and 4.8 (saved-calendar fallback). `isLeagueKey` picks up `epl` from `LEAGUE_KEYS`.
- `app/api/teams`, `app/api/schedule`, `app/api/download`, `app/api/calendars`: no change; they validate with `LEAGUE_KEYS`.
- `lib/validation/calendar-config.ts`: `z.enum(LEAGUE_KEYS)` and slug regex work once 4.1 lands.
- `app/api/leagues`: add `gameTypes` (4.7) and optional `note`.

## 5. Edge cases

| Case | Handling |
| --- | --- |
| Played vs upcoming split across two ESPN responses | Two requests per club (4.2), merged by event id in `buildGames()`; no overlap verified (5+33=38). |
| `fixture=true` returns current-season fixtures for another `season` | Dropped by the existing `requestedSeason.year` mismatch check. Covered by a unit test. |
| Next season (2027) not yet published | `resolveLeagueSeason()` stays on 2026 until `core/season` flips (window ends 1 Jun 2027); `seasons/2027` is 404 -> `pendingNextSeason`. With `regularSeasonTypeId: 1` the event count check works when ESPN publishes. |
| Fixture date/time moved for TV | Same event id, new `date`; UID `espn-{id}-{scope}` is stable so calendar clients update in place. Refresh window 15 min on ESPN side; clients poll on their own schedule. |
| Fixture date "to be confirmed" | If ESPN sets `timeValid: false`/status `STATUS_TBD`/detail with TBD, `normalizeGame()` marks `timeTBD` -> all-day event on `localDate` (computed in Europe/London). No `date` at all -> `dateTBD` -> unscheduled, excluded by `excludedBy: "unscheduled"`. ESPN's soccer TBD shape is unverified (no instance in current data) - see open questions. |
| Provisional Saturday 15:00 placeholders reported as `timeValid: true` | Cannot be distinguished from confirmed times; accepted. Mitigated by short revalidate and stable UIDs. Document on About page. |
| Postponed / cancelled | Existing `normalizeStatus()` `POSTPONE`/`CANCEL` handling: postponed -> tentative all-day, cancelled -> `STATUS: CANCELLED`. Unverified status names for soccer (4.6). |
| Draw | `winner` false on both sides; `{result}` renders "D 1-1" via `drawLabel`. Unplayed/no score -> empty. |
| Title ordering | Default `"{homeTeam} v {awayTeam}"` shows e.g. "Liverpool v Man City" for both clubs; away fixtures no longer render "Liverpool @ Bournemouth". |
| Neutral venues | Not applicable in league play (`neutralSite` false everywhere). Not special-cased. |
| UK vs US viewers | Event start is UTC in ICS, so Apple/Google/Outlook render local time. Template `{time}`/`{date}` use Europe/London. Broadcasts are US networks only; `{broadcast}` is empty for most fixtures and US-flavoured otherwise. Default description is empty, so the default feed does not show them. |
| Calendar title/season label | "Liverpool 2026-27 Schedule"-style via 4.3, never the 30-character ESPN name. |
| Club not in current catalog | See 4.8. |
| Name collisions in slug | Suffix with ESPN id (4.1). None among the 20 today. |
| ESPN outage | Unchanged: `lastGood` cache, 503 for feeds. |
| 38-event feed size | Trivial vs NFL/NCAAF. |

## 6. Testing

Fixtures (capture with curl from live ESPN, trim bulky `links`/`logos` arrays like existing fixtures; names follow `schedule-{league}-{team}-{year}-{type}.json`)
- `tests/fixtures/espn/teams-epl.json` (20 clubs incl. `slug` with dots/underscores, no `name`).
- `tests/fixtures/espn/season-epl-2026.json` (core `/seasons/2026` with single type id 1) and `season-epl-current-2026.json` (core `/season`, singular `type`, no `types.items`).
- `tests/fixtures/espn/schedule-epl-liverpool-2026-results.json` (default response, 5 post events incl. a draw).
- `tests/fixtures/espn/schedule-epl-liverpool-2026-fixtures.json` (`fixture=true`, 33 pre events).
- `tests/fixtures/espn/schedule-epl-liverpool-2025-fixtures-mismatch.json` (`season=2025&fixture=true`, `requestedSeason.year: 2026`).
- `tests/fixtures/espn/schedule-epl-liverpool-2025-reg.json` (completed season, trimmed to a few matches).
- Hand-edited fixtures (clearly labelled synthetic since not yet observed live): a TBD-time event (`timeValid:false`) and a postponed event (`STATUS_POSTPONED`).

Unit (`tests/unit/`)
- `espn-adapter.test.ts`: results+fixtures merge to 38 de-duplicated games sorted ascending; mismatched `requestedSeason` is dropped; draw has both `winner` false; `normalizeTeam()` yields slug `manchester-city` (not `eng.man_city`), unique across fixture; `buildCatalog()` with `flat` grouping returns 20 `tier: "primary"` teams with no conference.
- `seasons.test.ts`: `normalizeSeason()` on current-season fixture (no types) -> `seasonPhase` active on 2026-10-02; season label "2026-27"; `normalizeSeasonType({id:"1", name:"2026-27 English Premier League"}, epl)` -> `regular` (guards the fallback table); `fetchSeasonEventCount` uses type 1 (mock `espnFetchJson`).
- `templates.test.ts`: draw -> "D 1-1" for EPL, "T" for NFL; `{time}` formats in Europe/London for EPL and America/New_York for NFL; default EPL title "Liverpool v Man City" for home and away games.
- `config.test.ts`: registry invariants for `epl` (flat grouping, `scheduleQueries` non-empty, `regularSeasonTypeId`, `seasonTypeFallback` has "1"); `defaultConfig("epl", ...)` uses EPL template/duration 120; `isDefaultConfig` true for it.
- `events.test.ts`: TBD time -> all-day on London date; postponed -> tentative all-day; unaffected for existing leagues.
- `security.test.ts`: `buildEspnUrl` rejects segments with `.`/`_` still; query booleans serialize to `fixture=true`; `epl` slug rule.

Live (`tests/live/espn.test.ts`)
- Add `{ league: "epl", slug: "liverpool" }`. The existing `displayName` regex `^\d{4}(-\d{2})?$` assumes short names; with 4.3 the resolved season displayName (core `displayName`) is still the long name unless `normalizeSeason` shortens it - assert against the normalized label.
- Add assertions: `games.length === 38` for a completed or full season (20 clubs x 38); at least one past and one future game when in season; all games have the club as home or away.

E2E (`tests/e2e/`)
- `builder.spec.ts`: select Premier League in the dropdown, search "Liverpool" and "Man City", pick, assert preview shows both played and upcoming fixtures, the title "Liverpool v ...", and **no** Preseason/Postseason chips. Download/subscribe flows hit `/calendar/epl/liverpool.ics` and assert 38 `VEVENT`s with stable UIDs (stub ESPN as other specs do; add EPL stubs under `tests/stubs`).
- `subscription.spec.ts`: saved calendar for a club absent from the catalog still serves a valid `.ics` (4.8).
- `mobile.spec.ts`: league dropdown includes Premier League at 393 px.

## 7. Acceptance criteria

- [ ] `epl` appears in the league dropdown with label "Premier League"; `LEAGUE_KEYS`, zod enum, `/api/leagues` include it.
- [ ] Team picker lists exactly the 20 clubs from ESPN `/teams`, no conference text, no "show all" toggle; slugs match `^[a-z0-9-]+$`.
- [ ] `/calendar/epl/liverpool.ics` returns 38 events (played + upcoming), correct home/away, venue "Anfield, Liverpool", default title "Home v Away", 2 h duration.
- [ ] Calendar name reads "Liverpool Premier League 2026-27" (or the agreed template), not the long ESPN season name.
- [ ] Preview and builder show no Preseason/Postseason chips; counts match.
- [ ] Draws render "D x-x" in `{result}`; `{time}` is London time.
- [ ] A fixture whose ESPN time changes keeps its UID and updates in place; a TBD-time fixture becomes an all-day event on the London date.
- [ ] Saved calendar for a team absent from the current catalog still returns a valid feed.
- [ ] NFL/NBA/NCAAF output is byte-identical to before (existing tests unmodified and passing, aside from deliberate fixture additions).
- [ ] Unit, e2e and live tests added as in section 6 pass; About/layout copy says Premier League matches only.

## 8. Open questions and risks

1. **ESPN's TBD representation for soccer** is unverified: no `timeValid:false` or TBD status appears in current data. Capture a real instance (ask during TV-selection window, or inspect past seasons' postponed/rearranged fixtures) before relying on `timeTBD` logic. Treating all Saturday 15:00 slots as provisional was considered and rejected (it would mislabel confirmed matches).
2. **Provisional times flagged `timeValid:true`** (Saturday 3 pm placeholders) may cause events to move; acceptable but a user-facing risk. Consider an optional "kick-off may change" description note.
3. Statuses for in-play, postponed, abandoned and suspended soccer matches are unverified; `fixture=true` behaviour for a match in progress is unknown (could vanish from both responses for ~2 h?). Needs a check during a live match day; if it vanishes, add a third query or fall back to `scoreboard`.
4. `fixture=true` ignoring `season` means a **future** season cannot be fetched until ESPN flips the default; confirm the next-season behaviour in June 2027. Also not verified how the default results response behaves for an in-progress season mid-way (appears to be "post" only).
5. Broadcasts are US networks; UK broadcasters are unavailable. Test `?region=gb`/`lang`; if it works, decide whether the UK is a target audience. Otherwise `{broadcast}` is of limited value.
6. Relegated-club fallback via `GET teams/{id}`: cost and cache strategy (add `tags`, `REVALIDATE.teams`), and whether an empty 2026-27 calendar should show a notice. Product decision: keep serving empty, or point subscribers at manual season.
7. `abbreviation` for the season label: confirm MLS (`usa.1`) payload shape before finalizing the label rule so it stays shared.
8. Club name aliases ("Spurs", "Man Utd", "Wolves") for search: small effort, not specified; decide in design review.
9. Cups as a follow-up: will need a calendar-level "competitions" option and per-competition UID scoping (event ids are globally unique in ESPN, so the existing UID `espn-{id}-{scope}` would already be safe).
10. Dependency ordering with MLS: whichever ships first carries 4.1-4.8 (soccer-shared). MLS will additionally need conference grouping and playoffs; nothing here blocks that.
