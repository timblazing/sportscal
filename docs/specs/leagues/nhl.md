# Spec: add the NHL

Status: draft. ESPN findings below were verified live on 2026-10-02 (curl plus
parsing the responses with the existing zod schemas via `npx tsx`). Anything not
verified is listed under "Open questions".

Prerequisite: the league selector must already be the shadcn `Select` described
in [README.md](./README.md). That is not re-specced here. The NHL is the 4th
league; the current 3-column radio control would not fit it.

## 1. Summary, goals, non-goals

NHL is a near-zero-code addition. The adapter is already league-agnostic and the
NHL's ESPN data matches the NFL/NBA shape (`/groups` conference to division to
teams, season types 1/2/3, no weeks). The work is one registry entry, copy
updates, a small recommended OT/SO tweak to `{result}`, and tests/fixtures.

Goals
- Pick any of the 32 NHL teams and get the same builder, preview, `.ics`
  download and subscribable feed as NFL/NBA.
- Preseason, regular season and playoffs (with series notes such as
  "West Final - Game 4") appear correctly.
- Correct handling of the 84-game 2026-27 regular season, Global Series
  neutral-site games, and overtime/shootout finals.

Non-goals
- Standings, live scores, or in-progress game state beyond what exists today.
- A new visual design for league selection (see README prerequisite).
- Player/goalie data (ESPN returns `featuredAthletes`; ignored).
- AHL, PWHL, international hockey, or other `hockey/*` leagues.

## 2. ESPN data findings

Slugs: sport `hockey`, league `nhl`. URLs built by `buildEspnUrl` in
`lib/espn/client.ts`:
- Teams: `site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams?limit=1000`
- Groups: `.../sports/hockey/nhl/groups`
- Season: `sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/season` and `/seasons/{year}`
- Schedule: `.../hockey/nhl/teams/{id}/schedule?season={year}&seasontype={n}`
- Event count: `core/.../seasons/{year}/types/2/events?limit=1` (`count` field)

### Seasons
- `/season` currently returns `year: 2027`, `displayName: "2026-27"`. Naming is
  `YYYY-YY` from ESPN; the year is the END year (same convention as NBA).
  `/seasons/2026` is `2025-26`. `/seasons/2028` returns the core error body
  `{"error":{"message":"no instance found","code":404}}` (handled by
  `isCoreError` in `espnFetchJson`).
- Season types (all with ESPN `abbreviation`, so `normalizeSeasonType` resolves
  them without the fallback table):

| id | name | abbr | 2026-27 window (UTC) |
| --- | --- | --- | --- |
| 1 | Preseason | pre | 2026-09-15 to 2026-09-28 |
| 2 | Regular Season | reg | 2026-09-28 to 2027-04-11 |
| 3 | Postseason | post | 2027-04-11 to 2027-07-01 |
| 4 | Off Season | off | 2027-07-01 to 2027-09-16 |

- No Play-In type: `seasontype=5` returns 0 events and no `requestedSeason`.
  Do not include 5 in `scheduleSeasonTypes`.
- As of today (Oct 2) `seasonPhase` returns `active` for 2027 (regular season
  started 2026-09-28), so `resolveLeagueSeason` needs no change.
- **The 2026-27 regular season is 84 games, not 82.** Pittsburgh has 84 events
  for `season=2027&seasontype=2`, and the core count for type 2 is 1344
  (= 32 x 84 / 2). 2025-26 was 82. Nothing may hardcode 82.

### Teams
- 32 teams, all `isActive: true`. Ids are small integers except Seattle
  (`124292`) and Utah (`129764`). Pittsburgh = `16`. All parse with
  `espnTeamsResponseSchema`.
- Slugs are `city-nickname` (`pittsburgh-penguins`, `st-louis-blues`,
  `vegas-golden-knights`); `teams.ts` `findTeam` keys on these.
- Abbreviations are not all 3 letters: `LA`, `NJ`, `SJ`, `TB`, `UTAH`.
  `team-logo.tsx` slices to 3 chars only as a no-logo fallback; harmless.
- **Utah**: id `129764`, slug `utah-mammoth`, displayName "Utah Mammoth". The id
  is stable across the rename; in 2025-26 schedule data the competitor
  displayName was still "Utah Hockey Club" for older seasons (ESPN keeps the
  era name per event). Saved calendars keyed on id/slug are unaffected.
- **Abbreviation inconsistency**: the teams endpoint says `UTAH`, but the
  schedule competitor object (and event `shortName`) says `UTA`. So
  `{teamAbbr}` in a calendar name (from the catalog) can differ from
  `{opponentAbbr}` in events. Cosmetic; see Edge cases.
- Team objects inside schedule events have `nickname` and no `name`
  (the `/teams` list has `name`). `normalizeGameTeam` already falls back to
  `nickname`, so `{team}`/`{opponent}` yield "Penguins", "Predators".

### Grouping
- `/groups` returns two conferences with two divisions each, 8 teams per
  division, all 32 covered:
  - Eastern Conference (abbr `East`): Atlantic (`ATL`), Metropolitan (`MET`)
  - Western Conference (abbr `West`): Central (`CEN`), Pacific (`PAC`)
- **Unlike the shape the code was written against, group nodes have no `id`
  fields.** `espnGroupNodeSchema` has `id` optional, so it parses;
  `membershipFromGroups` yields `conference.id`/`division.id` as `undefined`.
  Any UI keying on those ids would collide; check that the picker groups by
  name (see section 4).
- Standings (`apis/v2/.../standings`) returns conference ids `7` (East) and `8`
  (West); not needed, `teamGrouping: { kind: "groups" }` works.

### Schedule responses (per team, per season type)
- `requestedSeason` is present for types with data (`{year,type,name,displayName}`)
  and absent for empty types (e.g. `seasontype=3` for 2027 returns `events: []`
  with no `requestedSeason`). `buildGames` already tolerates both.
- All events from the live responses (4 pre + 84 reg for 2027; 7 pre + 82 reg +
  6 post for 2026) pass `espnEventSchema` with zero rejects.
- `event.week` is absent; `hasWeeks: false`. `event.seasonType` carries `id`,
  `type`, `name`, `abbreviation` (`pre`/`reg`/`post`).
- `timeValid: true` on every event observed (0 TBD times in 2026-27 so far).
  Whether ESPN ever emits a TBD NHL time is unverified.
- Times are real UTC instants (`2026-10-03T23:00Z`); no midnight placeholders
  seen except playoff games that legitimately start 00:00Z (7 PM ET) - those
  are valid times, with `timeValid: true`.
- `competition.neutralSite: true` on the two Global Series games in 2025-26
  (Stockholm, Avicii Arena, 2025-11-14T19:00Z and 2025-11-16T14:00Z,
  `notes[0].headline = "NHL Global Series"`). Venue address has `city` and
  `country` ("Sweden") but no `state`. Domestic venues have `state` and
  `country: "USA"`; Canadian venue address shape not checked (open question).
  No Global Series appeared in Pittsburgh's 2026-27 schedule (other teams
  unchecked).
- Playoff headlines: `"East 1st Round - Game 1"`, `"West Final - Game 4"`,
  `"Stanley Cup Final - Game 6"` (found on Vegas and Carolina's 2025-26 data).
  Series games carry no "if necessary" marker or series score in `notes`.
- Status: `STATUS_FINAL` with `type.detail` of `Final`, `Final/OT`, `Final/SO`
  (`period: 4` for OT). `completed: true`, `winner` set on exactly one
  competitor, `score` is `{value, displayValue}`. In 2025-26, 82 games for
  Pittsburgh: 59 Final, 10 Final/OT, 13 Final/SO. Future games are
  `STATUS_SCHEDULED`. Postponed/cancelled NHL status names not observed
  (generic `POSTPONE`/`CANCEL` substring logic covers the usual ESPN names).
- Broadcasts: `broadcasts` can be `null` (15 of 84 events); entries use
  `media.shortName` ("TNT", "ESPN+", "NHL Net", "ESPN"). Local/regional
  networks are not present, only national. Already handled by
  `normalizeBroadcasts`.
- `links` contains `rel: ["summary","desktop","event"]` Gamecast URLs, so
  `findEspnUrl` works.

## 3. Config entry

In `lib/config/leagues.ts`:

```ts
export const LEAGUE_KEYS = ["nfl", "nba", "ncaaf", "nhl"] as const;
```

Order is the UI order after the README dropdown change; place `nhl` after
`nba` if that ordering is preferred (`["nfl","nba","nhl","ncaaf"]`) - purely a
product call. Existing saved-config `league` values are strings, so order is
safe.

```ts
nhl: {
  key: "nhl",
  sport: "hockey",
  league: "nhl",
  label: "NHL",
  name: "National Hockey League",
  defaultDurationMinutes: 150,
  scheduleSeasonTypes: [1, 2, 3],
  seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
  teamGrouping: { kind: "groups" },
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
},
```

Notes
- Duration 150 matches NBA and the product brief. README.md's illustrative NHL
  snippet says 165; reconcile README to whatever ships (see open questions).
- `scheduleTimeZone` stays ET: it only recovers the calendar date of an
  all-day TBD event, and ESPN publishes NHL data on ET. Canadian/Pacific teams
  do not need their own zone.
- No `5` season type (no Play-In).

## 4. Code changes beyond config

| File | Change |
| --- | --- |
| `lib/config/leagues.ts` | Add key + entry (section 3). `LeagueKey`, `z.enum(LEAGUE_KEYS)` in `app/api/schedule/route.ts`, `app/api/teams/route.ts`, `lib/validation/calendar-config.ts`, and `isLeagueKey` in `app/calendar/[league]/[...path]/route.ts` and `app/page.tsx` all derive from `LEAGUE_KEYS`: **no code change** there. |
| `lib/espn/client.ts` | None. Hostnames and `SEGMENT_RE` unchanged; `hockey`/`nhl` pass the regex. |
| `lib/espn/schemas.ts` | None. Live NHL responses parse with 0 failures. Group `id` is already optional. Update the stale comment "(NFL/NBA)" on `espnGroupsResponseSchema` to include NHL (optional). |
| `lib/espn/normalize.ts` | None required. `normalizeSeasonType`, `normalizeStatus`, `normalizeGame`, TBD logic all work. |
| `lib/espn/teams.ts` | None required. `membershipFromGroups` handles id-less nodes. Update the comment `NFL/NBA` on it (optional). `buildCatalog` `isFbs` branch is ncaaf-only. |
| `lib/espn/seasons.ts`, `schedules.ts` | None. `fetchSeasonEventCount` uses type 2, which exists. |
| `lib/calendar/templates.ts` | (a) `league` variable description: `"League (NFL, NBA, NCAAF)"` -> `"League (NFL, NBA, NHL, NCAAF)"`. (b) `week` description is football-flavoured but only renders when ESPN sends a week; NHL renders empty, which `renderTemplate` cleans. No change. (c) `note` description "(bowl name, playoff round)" already fits series notes. (d) **Recommended**: `resultLabel` currently yields `W 3-2` for an OT/SO game, losing the distinction. Append a suffix derived from `game.status.detail` when it matches `/Final\/(\d*OT|SO)/i`, e.g. `W 3-2 (OT)`, `L 2-3 (SO)`. This also affects NBA OT games (`Final/OT`, `Final/2OT`); that is arguably a fix but changes existing `{result}` output, so update `tests/unit/templates.test.ts` expectations and call it out in the PR. If the team prefers not to touch shared behavior, ship NHL without it (non-blocking). |
| `lib/calendar/events.ts`, `generator.ts`, `uid.ts`, `filters.ts` | None. UID is `espn-{eventId}-{scope}@sportscal.site`; ESPN event ids are global per league. |
| `lib/schedule-service.ts` | None. |
| `app/calendar/[league]/[...path]/route.ts` | None; league validated via `isLeagueKey`. |
| `app/api/*` | None (`leagues` route maps `LEAGUE_LIST`, so NHL appears automatically). |
| `lib/validation/calendar-config.ts` | None. `defaultConfig` reads duration from the registry. |
| `lib/db/schema.ts` | None. `league` is `varchar(16)`; "nhl" fits, no enum, no migration. |
| `components/builder/*`, `components/schedule/*` | `hasWeeks` is defined in the registry but is **not referenced anywhere** in `app`, `components` or `lib` (grep verified), and `isFbs` is only set for ncaaf. No league-conditional UI exists. Verify `team-picker.tsx` groups by conference/division **name**, not id (NHL group ids are undefined). Nothing else. |
| `app/layout.tsx` | Metadata description says "Pick an NFL, NBA, or college football team..." -> add NHL (and any other league shipping in the same release). |
| `app/about/page.tsx` | No league names listed; the disclaimer already says "any league or team". None. |
| `README.md` | Add **NHL** to the supported list (line ~21), mention NHL in the duration line (`NHL 2h30`), the example feed URL is optional, and align or remove the illustrative `nhl:` snippet near line 195 (currently `165`). |
| `tests/e2e/helpers.ts` | `pickTeam` type union `"NFL" \| "NBA" \| "NCAAF"` -> add `"NHL"`. After the README dropdown change, this helper changes anyway; add NHL there. |
| `app/page.tsx`, `lib/security/rate-limit.ts` | None. |

## 5. Edge cases

- **84-game season**: nothing in code assumes a game count. Fixtures and
  preview counts must not assert 82. `{season}` is the ESPN label `2026-27`.
- **Season rollover**: between the Stanley Cup Final and Sep 15 the core
  `/season` may still point at the finished season; `resolveLeagueSeason`
  moves to the next season only once `fetchSeasonEventCount` (type 2) returns
  > 0, otherwise shows the completed season with `pendingNextSeason`.
  Behavior during Jul-Sep is unverified (open question).
- **Preseason overlaps regular season start**: preseason type ends the same
  instant regular begins (09-28T07:00Z vs 06:59Z). Preview/filter by type, no
  conflict.
- **Playoffs before they exist**: `seasontype=3` returns empty and no
  `requestedSeason`; `buildGames` handles it (same as the existing
  `schedule-nfl-steelers-2026-post-empty.json` case). Playoff games appear
  incrementally; round headlines become the `{note}` (e.g.
  "West Final - Game 4"). Teams eliminated early have fewer events; "if
  necessary" games appear only when ESPN creates them.
- **Series notes**: `note` is taken from `competition.notes[0].headline`.
  Default title template does not include it; users can add `{note}`. Global
  Series games set `note = "NHL Global Series"` too.
- **International / Global Series**: `neutralSite: true` so `homeAway` renders
  "Neutral" and the symbol is `vs`. Event start is a UTC instant, so calendar
  clients show it in the user's time zone correctly. `venueFull` joins
  name, city, state; for Stockholm it renders "Avicii Arena, Stockholm" (no
  state), and `country` is not included. Acceptable; adding country to
  `venueFull` for non-USA venues is out of scope (note under open questions).
  `{date}`/`{time}` templates always use Eastern Time (`DISPLAY_TZ`), so a
  14:00Z Stockholm game reads "9:00 AM EST". This is consistent with other
  leagues and the existing variable descriptions ("Eastern Time").
- **TBD times**: none observed. If ESPN emits `timeValid: false` or
  `STATUS_TBD`, existing logic makes an all-day event on `localDate` in ET and
  the same UID later becomes timed. NHL games are rarely at midnight ET so
  the 05:00Z/04:00Z placeholder heuristic is not needed.
- **OT/SO outcomes**: `winner` is set correctly and scores are the final
  totals (shootout winner gets +1), so `W`/`L` is right and no `T` branch is
  reached (`resultLabel` falls to `T` only if neither side has `winner`; NHL
  has no ties). `statusLabel` returns "Final" for `Final/OT`/`Final/SO`; the
  OT/SO distinction lives in `status.detail`, used by the optional result
  suffix in section 4.
- **Duration**: 150 minutes is fixed per event; playoff OT games run longer.
  Users can adjust; not modeled per game.
- **Utah rename**: id and slug (`utah-mammoth`) are current; historical
  seasons show "Utah Hockey Club" per game. If ESPN changes the slug again,
  `findTeam` falls back to id (`slugOrId`), and saved calendars store the id
  (`teamId`), so feeds survive. Abbreviation `UTAH` (teams) vs `UTA` (schedule)
  can disagree; accept for now.
- **Abbreviations of 2 chars** (`LA`, `NJ`, `SJ`, `TB`): template cleanup and
  logo fallback handle shorter strings.
- **Broadcasts null / national only**: existing behavior; empty `{broadcast}`
  line is cleaned.
- **Seattle/Utah ids** are 6-digit; `SEGMENT_RE` and id validation in
  `calendar-config.ts` accept digits; confirm the `teamId` regex allows 6+
  digits (it already must for NCAAF ids).

## 6. Testing

### Fixtures (capture to `tests/fixtures/espn/`, following existing naming; sanitize to a few events where files would be large, as with existing ones)
- `teams-nhl.json` - `/teams?limit=1000` (32 teams)
- `groups-nhl.json` - `/groups` (conferences, divisions, no ids)
- `season-nhl-2026.json` - `/seasons/2026` (2025-26, completed)
- `season-nhl-2027.json` - `/seasons/2027` (2026-27, 84-game)
- `schedule-nhl-penguins-2026-reg.json` - 2025-26 regular, must include the two
  Stockholm Global Series games plus at least one `Final/OT` and one `Final/SO`
- `schedule-nhl-penguins-2026-post.json` - 6 East 1st Round games
- `schedule-nhl-penguins-2027-reg.json` - future schedule, includes null
  `broadcasts` events and an 84-event count
- `schedule-nhl-penguins-2027-post-empty.json` - empty playoff response without
  `requestedSeason`
- Optional `schedule-nhl-golden-knights-2026-post.json` for "Stanley Cup Final -
  Game 6" note.

### Unit tests
- `tests/unit/config.test.ts`: `LEAGUE_KEYS` includes `nhl`; `defaultConfig("nhl", ...)`
  uses duration 150; `calendarConfigSchema` accepts `league: "nhl"`.
- `tests/unit/espn-adapter.test.ts`:
  - `normalizeSeasonType` for NHL ids 1/2/3/4 with and without abbreviations;
    id-only fallback table.
  - `membershipFromGroups(groups-nhl)` gives 32 teams, 2 conferences, 4
    divisions, ids undefined, 8 per division; `buildCatalog` returns 32
    primary teams sorted, `isFbs` undefined.
  - `parseTeamsResponse` yields Utah `129764` / `utah-mammoth`.
  - `buildGames` on the fixtures: Global Series games have `neutralSite`, venue
    without state, `note = "NHL Global Series"`; OT/SO games are `completed`
    with `winner` set; empty post file returns no games; wrong
    `requestedSeason` discarded.
- `tests/unit/seasons.test.ts`: `decideSeason` with NHL 2026-27 metadata at
  2026-10-02 (active), at 2026-09-20 (upcoming), and at 2026-08-01 with 2027
  event count > 0 (moves to 2027).
- `tests/unit/templates.test.ts`: `{note}` renders series headline; `{week}`
  empty for NHL; if the OT suffix ships, `{result}` yields `W 3-2 (OT)` /
  `L 2-3 (SO)` and NBA still behaves as specified.
- `tests/unit/events.test.ts` / `ics.test.ts`: ICS for a Penguins fixture
  parses via ical.js, Global Series event is timed in UTC, 150-minute duration,
  UID `espn-{id}-16@sportscal.site`.
- Add `nhlPenguinsGames()` helper in `tests/helpers.ts` (team id `"16"`,
  `{ espnSeason: 2026, displayName: "2025-26" }`).

### Live tests
`tests/live/espn.test.ts` TARGETS: add
`{ league: "nhl", slug: "pittsburgh-penguins" }`. The existing assertion
`displayName` matches `/^\d{4}(-\d{2})?$/` already fits `2026-27`. Optionally
assert `getTeams("nhl")` returns 32.

### E2E
- `tests/e2e/helpers.ts`: widen the league union with `"NHL"`.
- `tests/e2e/builder.spec.ts`: one case "NHL -> Penguins": pick `pit`, assert
  URL `league=nhl&team=pittsburgh-penguins`, preview shows rows.
- `tests/e2e/subscription.spec.ts`: optional feed URL assertion
  `/calendar/nhl/pittsburgh-penguins/{id}.ics`.
- Update `mobile.spec.ts` only as required by the README dropdown change.

## 7. Acceptance criteria

- [ ] `nhl` in `LEAGUE_KEYS` and `LEAGUES`; `pnpm typecheck` and `pnpm lint` pass.
- [ ] `/api/leagues` lists NHL; `/api/teams?league=nhl` returns 32 teams grouped
      Eastern/Western Conference and the four divisions.
- [ ] Picker search finds `Pittsburgh Penguins`, `Utah Mammoth`, `St. Louis Blues`.
- [ ] Season resolves to `2026-27` as active on 2026-10-02; season menu lists
      `2026-27`, `2025-26`, ...
- [ ] Penguins preview for 2026-27 shows 4 preseason + 84 regular season games
      (no hardcoded 82); postseason empty without error.
- [ ] 2025-26 view shows the Stockholm games as neutral-site with venue
      "Avicii Arena, Stockholm" and `{note}` "NHL Global Series".
- [ ] Playoff games show series notes via `{note}`.
- [ ] `.ics` download and `/calendar/nhl/pittsburgh-penguins.ics` and a saved
      `/calendar/nhl/{slug}/{id}.ics` all validate and keep stable UIDs.
- [ ] Default event duration 2h30; editable.
- [ ] OT/SO final games render a correct W/L in `{result}` (with OT/SO suffix if
      adopted) and no ties.
- [ ] Docs/copy: `app/layout.tsx` metadata, `templates.ts` league variable
      description, README list/duration/snippet updated.
- [ ] Fixtures and unit tests above pass under `pnpm test`; live NHL target
      passes under `pnpm test:live`; e2e NHL flow passes.
- [ ] No DB migration needed; existing saved calendars (nfl/nba/ncaaf) unaffected.

## 8. Open questions and risks

1. **84-game season**: ESPN shows 84 games for 2026-27 (1344 events). Verified for
   Pittsburgh only; confirm all teams are consistent and make sure no copy
   says "82".
2. **Default duration**: 150 (brief/NBA) vs README's 165 example. Decide and make
   the README consistent. Playoff OT games run long.
3. **OT/SO suffix in `{result}`**: ship now (also changes NBA output) or defer?
4. **Group ids are absent** in NHL `/groups`. Confirm `team-picker.tsx` and any
   key/`value` props use names; otherwise fix to avoid duplicate React keys.
5. **Abbreviation mismatch** for Utah (`UTAH` teams vs `UTA` schedule). Decide
   whether to prefer the schedule's value; currently left as is.
6. **Jul-Sep season rollover** behavior of the core `/season` endpoint is
   unverified (today it already points at 2027 because we are past Sep 15).
7. **TBD/postponed NHL games**: no live example found. Confirm ESPN status names
   (`STATUS_POSTPONED`?) and whether `timeValid: false` is used.
8. **Global Series**: other teams' 2026-27 international games (if any) are
   unchecked; Canadian venue `address` shape (`state` as province?) unverified;
   `venueFull` omits country for non-USA venues.
9. **Stanley Cup Final headline format** confirmed ("Stanley Cup Final - Game 6")
   from the 2025-26 Vegas/Carolina data only; "if necessary" games unverified.
10. **Selector ordering and the sport grouping** (NHL after NBA vs append) is a
    product call tied to the dropdown spec.
11. **ESPN stability**: unofficial API; the group `id` fields could appear later
    (harmless) and the `abbreviation` differences could be fixed upstream.
