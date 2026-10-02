# Spec: add MLS (Major League Soccer)

Status: draft. ESPN slug `soccer/usa.1`. Verified against live ESPN on 2026-10-02.
Prerequisite: the league dropdown from [README.md](./README.md) (not re-specced here).
Sibling: [epl.md](./epl.md) (`soccer/eng.1`). Changes tagged **soccer-shared** are specified in epl.md section 4 (same field names: `scheduleQueries`, `regularSeasonTypeId`, `gameTypes`, `defaultTemplates`, `drawLabel`, flat grouping, slug derivation, season label, template time zone) and built once by whichever spec lands first. This document only restates what MLS needs from them and where MLS differs. Each shared proposal was re-checked live against `usa.1` (section 2, "Shared-proposal check").

## 1. Summary, goals, non-goals

MLS is the first soccer league and the first one where ESPN's team-schedule endpoint, season-type model and team slugs differ from the NFL/NBA/NCAAF assumptions baked into `lib/espn/*`. The config entry is small; most of the work is five adapter fixes (section 4) that are mostly soccer-generic.

Goals
- `mls` selectable in the builder; all 30 clubs (including San Diego FC) searchable, grouped by Eastern/Western Conference.
- Canonical feed `/calendar/mls/{team-slug}.ics`, saved calendars, download and preview work identically to the existing leagues.
- Schedule contains **past results, upcoming fixtures and every playoff round** (regular season + MLS Cup Playoffs + MLS Cup).
- Soccer conventions: draws shown as `D`, ~2 h default duration, no "week".

Non-goals
- Leagues Cup, U.S. Open Cup, CONCACAF Champions Cup, MLS NEXT Pro, friendlies. Verified: `soccer/usa.1/teams/{id}/schedule` returns only `usa.1` events (every event has `league.slug === "usa.1"`; 2025 Inter Miami returned 34 regular-season games and no Leagues Cup games). Other competitions need other slugs (`concacaf.leagues.cup`, `usa.open`, `concacaf.champions`), separate season models and a multi-slug adapter. That is a future "competitions" feature, applicable to EPL too (FA Cup, Champions League).
- MLS All-Star Game (season type 2, not a team fixture).
- Live scores, standings, per-match lineups.

## 2. ESPN data findings

All URLs built by `buildEspnUrl` in `lib/espn/client.ts`. The league segment `usa.1` contains a `.`, but it comes from config (`leaguePath`), not through the `SEGMENT_RE` check, so the client needs no change.

### Teams: `site/.../soccer/usa.1/teams?limit=1000`
- 30 teams, all `isActive: true`, parses with `espnTeamsResponseSchema`. San Diego FC: id `22529`, abbr `SD`, slug `san_diego_fc`.
- Names: `name === location === displayName` (e.g. "Austin FC"); `shortDisplayName` is the city ("Austin", "Red Bull NY", "NYCFC", "LA Galaxy"). So `{team}` (= `shortName`) renders as the short form and `{teamShort}` (= `location`) is the *full* name, not "school or city".
- **All 30 ESPN slugs are invalid for SportsCal.** They contain `_` and/or `.` (`usa.chicago`, `austin_fc`, `st._louis_city_sc`, `usa.los_angeles`). `normalizeTeam` uses `raw.slug`, but `SLUG_RE` in `app/calendar/[league]/[...path]/route.ts` and `teamSlug` in `lib/validation/calendar-config.ts` require `^[a-z0-9-]{1,100}$`. Result today: every canonical feed would 404 and every saved calendar would fail validation.
- `slugify(displayName)` yields 30 unique valid slugs (`san-diego-fc`, `la-galaxy`, `lafc`, `d-c-united`, `cf-montreal`, `st-louis-city-sc`, ...).
- Team-schedule competitors lack `name` and `slug` (only `location`, `abbreviation`, `displayName`, `shortDisplayName`, `logos`, `links`). `normalizeGameTeam` already falls back correctly (`name` becomes the short name).

### Grouping
- `site/.../usa.1/groups` is **useless**: `{"groups":[{"name":"Eastern Conference","abbreviation":"East"},{"name":"Western Conference","abbreviation":"West"}]}`. No ids, no teams, no children. `membershipFromGroups` would produce an empty map.
- `apis/v2/sports/soccer/usa.1/standings` (no `group` param) works: root `{id:"8675309", name:"MLS"}` with children `{id:"1","Eastern Conference"}` and `{id:"2","Western Conference"}`, each with 15 `standings.entries[].team.id`, all matching the teams list. Conferences do **not** set `isConference`, so the existing `membershipFromStandings` would assign no conference. No divisions.
- Team detail also carries `groups.id` (SD = `"2"`), but that costs one request per team; not used.

### Season: `core/.../leagues/usa.1/season` and `/seasons/{year}`
- Current: `year 2026`, `displayName "2026 MLS"`, `startDate 2026-01-01`, `endDate 2026-12-31`. Calendar-year season, `year` = the display year. Parses with `espnSeasonSchema`.
- `/seasons/2027` returns `{"error":{"message":"no instance found","code":404}}` (handled as `EspnNotFoundError`).
- **18 season types** (ids 0-17), identical structure in 2025 and 2026:

| id | name | notes |
| --- | --- | --- |
| 0 | Combined | empty |
| 1 | Regular Season | abbr `2026 MLS`; only type with regular games |
| 2 | All-Star Game | non-goal |
| 3 / 4 | Eastern / Western Conference Playoffs - Wild Card | empty in 2025; exist in 2026 |
| 5-8 | Eastern Conference Playoffs - Round One | one id per series slot |
| 9-12 | Western Conference Playoffs - Round One | one id per series slot |
| 13 / 14 | Eastern / Western Conference Playoffs - Semifinals | |
| 15 / 16 | Eastern / Western Conference Playoffs - Final | |
| 17 | MLS Cup | `isFinal: true`, ends `2027-01-01` |

- With the NBA fallback table, `normalizeSeason` classifies 3-16 as `postseason` (name contains "playoff") but **MLS Cup (17) as `other`**, which `isSeasonTypeIncluded` treats as regular season, and `competitiveSeasonEnd` ignores it. A config-level `seasonTypeFallback` fixes both (section 3).
- Core `types/2/events` (used by `fetchSeasonEventCount`) is the All-Star Game for MLS; the regular season is `types/1/events` (count 511 for 2026 = 510 matches + 1).

### Team schedule: `site/.../usa.1/teams/{id}/schedule`
Findings for San Diego FC (22529) and others, season 2026:
1. **Default response contains only completed matches** (27 of 34, all `STATUS_FULL_TIME`; same shape for LAFC, Red Bull NY, Chicago). Upcoming matches are missing. They exist in `scoreboard?dates=20261010` (e.g. event 761845) but not in the default team schedule.
2. **`?fixture=true` returns only upcoming matches** (SD: 7, `STATUS_SCHEDULED`, 2026-10-10 to 2026-11-08). Results plus fixtures together are the complete 34. Each event has `timeValid: true`, broadcasts (`Apple TV`, some `FS1`), venue.
3. `seasontype` works as an exact filter: with `season=2026&seasontype=1` only type 1 returns events; types 0, 2-17 return `events: []` (response has no `requestedSeason`).
4. Playoff games are fetched per type id. 2025 Inter Miami: type 7 = Round One (3 games, notes `[{type:"event", headline:"Game 1|2|3"}]`, best-of-3 confirmed), type 13 = Semifinal, type 15 = East Final, type 17 = MLS Cup. Which of 5-8 / 9-12 holds a given team's series is unknown in advance, so all ids must be queried.
5. Some playoff notes are `{type:"event-ingest-note", text:"Inter Miami CF advances."}` with no `headline`; the existing note picker (`headline` only) returns undefined for them. Fine.
6. **`fixture=true` with a season that is not current silently returns the current season**: `season=2025&fixture=true` and `season=2027&fixture=true` both return the 7 upcoming 2026 games with `requestedSeason.year: 2026`. The existing `requestedSeason` check in `buildGames` (`lib/espn/schedules.ts`) discards these. That guard is load-bearing for soccer; keep it and add a test.
7. Events carry `season.year/displayName` (`2026 MLS`), `seasonType {id, type, name, abbreviation}`, `league {slug:"usa.1"}`, **no `week`**, `neutralSite: false`, `competition.notes: []` for regular season.
8. Shape differences vs `lib/espn/schemas.ts`: none breaking. `score` is an object `{value, displayValue, ...}` (already handled); `venue.address.city` is `"Austin, Texas"` with no `state` (so `{state}` is empty and `{venueFull}` reads "Q2 Stadium, Austin, Texas", which is fine). Competitor also has `shootoutScore` on soccer events (null in all samples; not in schema).
9. **Draws**: both competitors `winner: false` with equal scores. `resultLabel` emits `T 3-3`; soccer wants `D 3-3`.
10. Schedule gap visible in the data: no matches 2026-05-24 to 2026-07-23 (FIFA World Cup break). No handling needed.
11. Today (2026-10-02) the schedule responses never include a TBD time; the TBD representation for soccer is unverified (open question).

### Shared-proposal check (epl.md vs `usa.1`, live 2026-10-02)
| epl.md proposal | holds for MLS? | evidence / difference |
| --- | --- | --- |
| Default schedule = completed only; upcoming needs `fixture=true` | yes | all 30 clubs: results + fixtures = 34 unique events each, 510 unique league-wide (matches core `types/1/events` count 511 less one extra id), **0 overlap** |
| `fixture=true` ignores `season` | yes | `season=2025\|2027&fixture=true` returns 2026 with `requestedSeason.year: 2026`; `buildGames` guard drops it |
| `seasontype` ignored | **no, MLS differs** | exact filter: type 1 = regular season, playoffs only under ids 3-17, each queried separately; `fixture=true&seasontype=1` works |
| `fetchSeasonEventCount` type id | yes, value 1 | type 2 = All-Star Game (EPL: 0 events) |
| Slugs fail route regex, derive from club name | yes | 30/30 ESPN slugs invalid; `slugify(displayName)` unique for all 30 |
| `{kind:"flat"}` grouping | **no, MLS differs** | MLS needs conferences: `/groups` has no ids/teams; standings (no `group` param) gives East/West with 15 teams each, no `isConference` |
| "Home v Away" default title, `drawLabel: "D"` | yes | draws: both `winner:false`, equal scores |
| Template times in league zone | yes, no visible change | MLS `scheduleTimeZone` stays `America/New_York` (clubs span ET/CT/MT/PT; one display zone for all) |
| Builder chips from config (`gameTypes`) | yes | MLS: `["regular","postseason"]` |
| Season label from `abbreviation` | yes | core season `abbreviation: "2026"`, `displayName: "2026 MLS"`; MLS payload does have `types.items` (EPL's current-season payload does not) |
| `types` fallback table required | yes | MLS "MLS Cup" (17) would otherwise be `other` |

## 3. Config entry

New `LEAGUE_KEYS` entry `"mls"` (order: after `ncaaf`, per README ordering) and:

```ts
// Playoff ids 3-17 (Wild Card, Round One x8, Semifinals x2, Finals x2, MLS Cup); 2 = All-Star Game, excluded.
const MLS_SCHEDULE_TYPES = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

mls: {
  key: "mls",
  sport: "soccer",
  league: "usa.1",
  label: "MLS",
  name: "Major League Soccer",
  defaultDurationMinutes: 120,
  scheduleSeasonTypes: MLS_SCHEDULE_TYPES,
  // epl.md field. One results and one fixtures query per season type.
  // Index 0 ({seasontype:1}) and its fixtures twin are the required requests (section 4).
  scheduleQueries: MLS_SCHEDULE_TYPES.flatMap((t) => [{ seasontype: t }, { seasontype: t, fixture: true }]),
  regularSeasonTypeId: 1,                                    // epl.md field
  seasonTypeFallback: {
    "0": "other", "1": "regular", "2": "other",
    ...Object.fromEntries([3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map((i) => [String(i), "postseason"])),
  },
  gameTypes: ["regular", "postseason"],                      // epl.md field (no preseason in ESPN's MLS data)
  teamGrouping: { kind: "conferenceStandings" },             // MLS-only variant (EPL uses "flat")
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
  drawLabel: "D",                                            // epl.md field
  defaultTemplates: { title: "{homeTeam} v {awayTeam}" },    // same default as EPL
}
```

Fields reused from epl.md (defined there, not redefined here): `scheduleQueries`, `regularSeasonTypeId`, `gameTypes`, `defaultTemplates`, `drawLabel`. MLS-only additions: `TeamGroupingSource` variant `{ kind: "conferenceStandings" }` and optional `postseasonLabel?: string` ("Playoffs"; used by the postseason chip and `seasonTypeShort`; omit to keep "Postseason", EPL does not need it). `scheduleSeasonTypes` is kept (it is a required field today) and mirrors the ids used in `scheduleQueries`. `hasWeeks` is not read anywhere in the app today, so `false` has no effect.


## 4. Code changes beyond config

"Shared" items are specified in epl.md section 4; the number is given. Only the MLS-specific requirements are listed.

### `lib/espn/schedules.ts` (`fetchTeamGames`): soccer-shared (epl.md 4.2)
- Iterate `league.scheduleQueries` (pass each record as query params next to `season`; `buildEspnUrl` value type gains `boolean`). `buildGames` is unchanged: merge by id plus the `requestedSeason` guard.
- MLS difference: 32 queries (16 season types x results/fixtures) per team refresh versus EPL's 2. Required: the first query and its `fixture` twin (regular season). Run the rest with `Promise.allSettled` and ignore rejections (`espnFetchJson` already serves last-good data). Gate this by `scheduleQueries.length > 2` or apply to all leagues; either is fine, but state the choice in the PR since it changes failure behavior for existing leagues if applied globally.
- Skip `fixture: true` queries when `season.status === "completed"` (they would only return the wrong season; epl.md calls this optional, for MLS it saves 16 requests).
- Optional follow-up: carry the season's type windows in `ResolvedSeason` and only query playoff types whose window has started/not ended, or derive the id list from the season's `types` (open question 6).

### `lib/espn/normalize.ts`: soccer-shared (epl.md 4.1, 4.3, 4.6)
- Slug: `slugify(displayName)` for soccer, unique within the catalog (suffix `-{id}` on collision). MLS is blocked without it (30/30 raw slugs invalid). Verified unique for all 30 clubs.
- Season label: prefer core `abbreviation` when it matches `^\d{4}(-\d{2,4})?$` (MLS: "2026"), else strip the trailing league label/name (events only carry `season.displayName` "2026 MLS" -> "2026"), else `displayName`. Add `abbreviation` to `espnSeasonSchema`. Keeps `{season}`, the default calendar name `"{team} {season} Schedule"` and the live-test regex valid.
- `normalizeSeasonType`: none for MLS (the `seasonTypeFallback` table in config handles MLS Cup).
- `normalizeStatus`: only STATUS_SCHEDULED and STATUS_FULL_TIME are observed; abandoned/suspended/penalty-final statuses are unverified (epl.md 4.6 + open question 3 here).

### `lib/espn/schemas.ts`: soccer-shared
- Optional `shootoutScore` on `espnCompetitorSchema` (null in every sample); `abbreviation` on `espnSeasonSchema`.

### `lib/espn/seasons.ts`: soccer-shared (epl.md 4.3)
- `fetchSeasonEventCount` uses `league.regularSeasonTypeId ?? 2`. MLS value 1 (type 2 is the All-Star Game, so the default would silently report 0/1 wrong events).
- `seasonPhase`: correct for MLS once MLS Cup is `postseason`: 2026 stays `active` until 2027-01-01, then `completed` with `pendingNextSeason` while `/seasons/2027` is 404.

### `lib/espn/teams.ts`: MLS-only grouping variant (epl.md 4.4 defines `flat`, which MLS does not use)
- New `TeamGroupingSource` variant `{ kind: "conferenceStandings" }`. `loadCatalog` fetches `buildEspnUrl("standings", league, ["standings"])` with no `group` param; new pure `membershipFromConferenceStandings(data)` parses with `espnStandingsNodeSchema` and, for each root child that has `standings.entries`, maps each `team.id` to `{ tier: "primary", conference: { id, name, shortName: abbreviation } }`. No divisions. A failing request throws (sole grouping source). The existing `membershipFromStandings` is not reused because MLS conferences lack `isConference`; changing it could affect NCAAF.
- `buildCatalog` tier: `flat` and `conferenceStandings` both yield `primary` (coordinate the one-line change with epl.md 4.4).
- Cache key: bump `espn-team-catalog-v1` to `-v2` once (epl.md 4.4); whichever PR lands first does it.

### `lib/calendar/templates.ts`: soccer-shared (epl.md 4.5)
- `drawLabel` ("D") for `resultLabel`. MLS addition: when scores are level and one competitor has `winner: true` (penalties), render `W 1-1 (pens)` / `L 1-1 (pens)`; unverified (open question 3).
- Template date/time use the league's `scheduleTimeZone`. MLS stays `America/New_York`, so no visible change.
- MLS-only, optional: `{round}` = `seasonType.name` for postseason games ("Eastern Conference Playoffs - Round One"); `{note}` already yields "Game 1/2/3"; `{seasonType}` stays "Postseason".

### `lib/validation/calendar-config.ts`, `hooks/use-builder-settings.ts`, `components/builder/sports-calendar-builder.tsx`: soccer-shared (epl.md 4.5)
- `defaultConfig` and `defaultSettings` merge `LEAGUES[league].defaultTemplates` over `DEFAULT_TEMPLATES`; the builder's placeholder/reset code (`DEFAULT_TEMPLATES.*` around lines 304-349) and `resetForTeam` (templates swap on league change only if the user has not edited them) use the league defaults. `isDefaultConfig` is unchanged.

### UI and league-aware components
- `components/builder/game-type-options.tsx`: soccer-shared (epl.md 4.7). Render only `league.gameTypes`; MLS shows Regular season + Postseason (Preseason hidden). Expose `gameTypes` through `/api/leagues`. MLS-only: label the postseason chip/`seasonTypeFallback` display "Playoffs" via optional `postseasonLabel` (also in `components/schedule/game-labels.tsx` `seasonTypeShort`).
- `components/builder/team-picker.tsx`: none (conference name is searchable; groups appear as Eastern/Western Conference).
- `components/schedule/game-labels.tsx` `HomeAwayMark`, `StatusText`: none.
- `app/layout.tsx` description and `app/about/page.tsx` copy: soccer-shared (epl.md 4.9); MLS wording: "MLS matches and playoffs only; Leagues Cup, U.S. Open Cup and CONCACAF Champions Cup are not included". Use the shared per-league note mechanism (`LeagueConfig.note`) if epl.md 4.9 adds it.
- `app/page.tsx`: none.

### Saved calendars for teams missing from the catalog: soccer-shared (epl.md 4.8)
MLS has no relegation, but expansion/contraction or a club rename can still remove a team from `/teams`; the same `GET teams/{id}` fallback applies (verified `teams/22529` works). No MLS-specific work.

### Route validation, API, DB: none
- `app/calendar/[league]/[...path]/route.ts`, `app/api/*`: none beyond the shared slug fix (`LEAGUE_KEYS`/`isLeagueKey`/`z.enum` pick up `mls`).
- `lib/db/schema.ts`: none (`league varchar(16)`, no enum, no migration). `lib/calendar/uid.ts`, `generator.ts`, `filters.ts`: none. League dropdown: README prerequisite.

## 5. Edge cases

| Case | Handling |
| --- | --- |
| Default schedule omits upcoming games | `fixture=true` twin requests, merged by event id in `buildGames` |
| `fixture=true` for a non-current season returns the current season | existing `requestedSeason.year` guard discards; fixtures skipped for completed seasons |
| Team has no game in a given playoff type | empty `events`, no `requestedSeason`; ignored |
| Playoff series games (best-of-3 Round One) | each game is its own event with `note` "Game 1/2/3"; later games appear only once ESPN schedules them; same UID per event so no duplicates |
| MLS Cup classified as `other` | fixed by `seasonTypeFallback["17"] = "postseason"` |
| All-Star Game | not queried (type 2 excluded) |
| FIFA international breaks / World Cup gap | schedule simply has no events; nothing special |
| TBD date/time | existing logic (`timeValid`, `STATUS_TBD`, "TBD"/"TBA" in detail) becomes all-day events using `scheduleTimeZone`; soccer TBD shape unverified |
| Postponed/canceled | existing `POSTPONE`/`CANCEL` detection; extended for abandoned/suspended |
| Draw | `D 3-3` |
| Penalty-decided playoff game | `W/L x-x (pens)` if `winner` flags set with level scores; verify (open question 3) |
| Canadian clubs (Toronto, Montreal, Vancouver) | venue city "Toronto, Ontario"-style; `{state}` empty; times in `America/New_York` per existing display tz |
| ESPN raw slug invalid | slug derived from `displayName` (epl.md 4.1) |
| Two clubs with the same short name | `{team}` uses `shortDisplayName` which is unique in the current 30 (city or nickname form) |
| Season rollover | auto resolver stays on 2026 until 2027-01-01, then "completed + pending next" until `/seasons/2027` exists |
| MLS moving to a fall-spring calendar after a 2027 transition season (league announcement; unverified against ESPN) | season id/naming for 2027 is unknown; see open questions |
| Playoff-type request failure | non-required request failures are swallowed; regular-season failure still 503s via `EspnError` |

## 6. Testing

Fixtures in `tests/fixtures/espn/` (save raw live JSON, following existing naming):
- `teams-mls.json` (30 teams, raw slugs included)
- `standings-mls.json` (conference nodes without `isConference`)
- `groups-mls.json` (the empty two-node response, pins the quirk)
- `season-mls-2026.json` (18 types)
- `schedule-mls-sandiego-2026-reg.json` (default/results response, 27 events)
- `schedule-mls-sandiego-2026-reg-fixtures.json` (`fixture=true`, 7 events)
- `schedule-mls-sandiego-2026-fixtures-wrongseason.json` (`season=2025&fixture=true`, returns 2026)
- `schedule-mls-miami-2025-post-r1.json` (type 7), `schedule-mls-miami-2025-post-final.json` (type 17), `schedule-mls-miami-2025-post-empty.json` (e.g. type 5)
- Capture later, when available: a postponed match, a TBD-time fixture, a playoff game decided on penalties (`schedule-mls-<team>-<year>-post-pens.json`).

Unit (`tests/unit/`, vitest):
- `espn-adapter.test.ts`: MLS team catalog (30 teams, valid slugs, unique, `san-diego-fc`, `lafc`, conference East/West 15 each, all `primary`); season label normalizes to "2026" (abbreviation, and the strip fallback for event `season.displayName`); season types 3-17 normalize to `postseason`, 17 included; merging results + fixtures yields 34 games sorted ascending, no duplicates; wrong-season fixtures response yields zero games; playoff game has note "Game 1"; draw game has score both sides and `winner` false.
- `templates.test.ts`: `result` is `D 3-3` for a soccer draw; penalties case if fixture exists; default title for MLS renders `Austin v San Diego` regardless of selected side.
- `events.test.ts`: `defaultConfig("mls", ...)` has `durationMinutes` 120 and the soccer default title; add to the existing duration assertions (210/210/150).
- `config.test.ts`: `calendarConfigSchema` accepts `league: "mls"` and a slugified team slug; still rejects `mlb` (the existing negative test uses `mlb`, which will be a valid key once the MLB spec lands, so retarget that assertion to an obviously fake league).
- `seasons.test.ts`: `fetchSeasonEventCount` uses `regularSeasonTypeId`; `decideSeason` for an MLS 2026 fixture (active on 2026-10-02, completed on 2027-01-02 with pending next).

Live (`tests/live/espn.test.ts`): add `{ league: "mls", slug: "san-diego-fc" }` to `TARGETS`. Keep the season `displayName` regex but assert against the normalized label, and add an assertion that completed + upcoming games are both present when the season is active (games > 27 for a mid-season run is too brittle; assert both a `completed` and a non-completed game exist between August and October).

E2E (`tests/e2e/`): extend `pickTeam` helper's league union with `"MLS"` (it types `"NFL" | "NBA" | "NCAAF"` and, after the README prerequisite, drives the Select); add `builder.spec.ts` "MLS -> San Diego FC -> schedule -> download": team grouped under Western Conference, Preseason chip absent, "Playoffs" chip present, default title is "Home v Away", downloaded `.ics` contains `SUMMARY:` with ` v ` and no preseason events.

## 7. Acceptance criteria

- [ ] `mls` appears in the league dropdown and `/api/leagues`; `calendarConfigSchema` accepts it; no DB migration.
- [ ] `getTeams("mls")` returns 30 teams with valid slugs, grouped Eastern/Western Conference (15 each), including San Diego FC.
- [ ] `/calendar/mls/san-diego-fc.ics` returns 200 with 34 regular-season events (27 played + 7 upcoming as of 2026-10-02), correct UTC start times, venues, `Apple TV`/`FS1` broadcasts, 120-minute duration.
- [ ] Past 2025 season (manual override) shows 34 games for a club and no fixture duplicates or 2026 games leaking in.
- [ ] Playoff games appear for a team once scheduled, including Round One "Game 1/2/3" notes, Semifinal, Conference Final, and MLS Cup, all under the Postseason/Playoffs toggle; MLS Cup is not shown when playoffs are excluded.
- [ ] Draws render `D x-x`; default title is `Home v Away` (same as EPL); NFL/NBA/NCAAF default title and tests unchanged.
- [ ] Preseason chip hidden for MLS; shown and unchanged for others.
- [ ] Calendar name for MLS reads "San Diego 2026 Schedule" (normalized season label), not "2026 MLS".
- [ ] Season resolution: `active` today; after 2027-01-01 it reports `completed` with pending next season rather than an error.
- [ ] Failure of a non-regular playoff-type request does not fail the feed; failure of the regular-season request returns 503 with `retry-after`.
- [ ] All unit tests pass, `pnpm test:live` passes for MLS, e2e MLS flow passes.

## 8. Open questions and risks

1. **Request volume**: 32 requests per team refresh (16 season types x results/fixtures) is the cost of ESPN's per-type filtering. Acceptable with Next fetch caching, but confirm it is not near any ESPN throttling; gating by season-type windows is the mitigation (section 4).
2. **Default title**: aligned with epl.md (`{homeTeam} v {awayTeam}`). The alternative, keeping the global `{team} {homeAwaySymbol} {opponent}`, avoids shared builder/validation changes but away games read "San Diego @ Austin". US soccer fans may prefer "vs"; revisit only as a shared decision with EPL.
3. **Penalty shootouts**: `shootoutScore` was null in every sample and no shootout game exists in current data. Need a live fixture (an MLS Round One Game 3 or MLS Cup on penalties) to confirm how ESPN reports level scores, `winner`, and status (`STATUS_FINAL_PEN`).
4. **TBD and postponed shape for soccer**: no TBD, postponed, delayed, or abandoned match exists in current data. Statuses and `timeValid` behavior are unverified; capture fixtures when they occur. Also unknown: whether ESPN's TBD midnight for MLS is in Eastern time (config uses `America/New_York`).
5. **2027 transition**: MLS has announced moving to a fall-spring calendar after a 2027 transition season; ESPN currently returns 404 for `seasons/2027`, so season id/name (`2027 MLS` vs `2027-28 MLS`), type ids and `year` semantics are unknown. The season resolver should handle it, but the season-label rule (abbreviation, else strip league name) and the live-test regex may need revisiting.
6. **Playoff type ids**: Round One ids 5-8/9-12 and Wild Card ids 3/4 are stable across 2025 and 2026, but the playoff format has changed before (a Wild Card round appears in the 2026 definition). If MLS changes format, `scheduleSeasonTypes` needs updating; consider deriving the list from the season's `types` instead of hard-coding (also removes empty-type requests).
7. **Shared-work ordering with EPL**: field names follow epl.md (`scheduleQueries`, `regularSeasonTypeId`, `gameTypes`, `defaultTemplates`, `drawLabel`, slug and season-label rules, `flat`). The first-landing spec carries epl.md 4.1-4.8. MLS adds only `conferenceStandings`, `postseasonLabel`, the allSettled fan-out tolerance, and (optionally) `{round}`. If `scheduleQueries` is not yet in the codebase when MLS lands, MLS carries it.
8. **Cross-competition games** (Leagues Cup, CONCACAF Champions Cup, U.S. Open Cup) are excluded; users with MLS clubs in those competitions will see gaps. Product call whether this is a follow-up.
