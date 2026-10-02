# WNBA

Status: draft. ESPN findings verified with live requests on 2026-10-02.
Prerequisite: the shared league dropdown in [README.md](./README.md). This spec
does not re-specify it.

## 1. Summary, goals, non-goals

Add the WNBA (`basketball/wnba`) as a fourth league. It is almost entirely a
config entry. The only non-obvious decision is team grouping: ESPN's `/groups`
endpoint does not carry team membership for the WNBA, so the entry uses the
existing `standings` grouping source (the NCAAF path), not `groups`.

Goals
- WNBA selectable in the builder; team picker shows 15 teams grouped by
  conference; season resolution, preview, download and subscription feeds work
  like NBA.
- Preseason, regular season and postseason selectable through the existing
  Include chips.
- Graceful behaviour in the offseason when ESPN has no next-season data.

Non-goals
- All-Star Game, Commissioner's Cup as a separate filter, draft, free agency
  or other non-team-schedule events.
- Any new UI, new DB columns, or new template variables.
- A WNBA-specific TBD or "if necessary" game treatment (see open questions).

## 2. ESPN data findings

Slugs: `sport=basketball`, `league=wnba`. All URLs below are built by
`buildEspnUrl` in `lib/espn/client.ts` and pass the `SEGMENT_RE` check.

### Season (core API)
- `GET core/.../wnba/season` returns `year: 2026`, `displayName: "2026"`,
  `startDate 2026-04-03T07:00Z`, `endDate 2026-11-01T06:59Z`. Single calendar
  year naming (NBA is "2026-27"). `espnSeasonSchema` parses it unchanged.
- Season types in `types.items` (4):

  | id | name | abbr | 2026 window | notes |
  | --- | --- | --- | --- | --- |
  | 1 | Preseason | pre | 2026-04-03 to 2026-05-08 | `hasStandings: true` |
  | 2 | Regular Season | reg | 2026-05-08 to 2026-09-25 | |
  | 3 | Postseason | post | 2026-09-25 to 2026-11-01 | end date is a placeholder, later than the real Finals end |
  | 4 | Off Season | off | 2026-11-01 to 2027-05-01 | |

  No Play-In type 5. Every id maps correctly through `normalizeSeasonType`
  (4 normalizes to `other`, which `competitiveSeasonEnd` ignores). Verified by
  running `normalizeSeason` on the live response: `[1 preseason, 2 regular,
  3 postseason, 4 other]`.
- 2024 and 2025 season objects have the same 4-type shape (`/seasons/2025`
  postseason 2025-09-12 to 2025-10-20).
- `GET core/.../seasons/2027` returns `{"error":{"code":404}}`, and
  `seasons/2027/types/2/events?limit=1` returns `count: 0`. `fetchSeason`
  maps the 404 to `null`, `fetchSeasonEventCount` to 0.
- `seasons/2026/types/2/events` has `count: 333`.

### Teams (site API)
- `GET site/.../wnba/teams` returns 15 teams, all `isActive: true`, all with
  `logos` (14 to 16 entries, including `rel: ["full","default"]` and
  `["full","dark"]`), and a 6-hex `color`. `espnTeamSchema` and `pickLogo`
  work unchanged (0 teams without a logo; picks `.../500-dark/xx.png`).
- Expansion teams are present: Golden State Valkyries (id 129689, `GS`),
  Toronto Tempo (131935, `TOR`), Portland Fire (132052, `POR`). The three new
  ids are 6 digits, the others are 1 to 2 digits. Ids are strings in the
  response; `idLike` handles both.
- Slugs are standard (`atlanta-dream`, `golden-state-valkyries`,
  `portland-fire`, ...). Live test target: `indiana-fever` (id 5) or
  `atlanta-dream` (id 20).

### Grouping
- `GET site/.../wnba/groups` returns only
  `{"groups":[{"name":"Eastern Conference","abbreviation":"E"},{"name":"Western Conference","abbreviation":"W"}]}`.
  No `id`, no `teams`, no `children`. NBA's `/groups` by contrast returns
  conference > division > teams. So `membershipFromGroups` would run without
  error but return an empty map: every team would have no conference.
  **`teamGrouping: { kind: "groups" }` is wrong for WNBA.**
- `GET apis/v2/.../wnba/standings` (and `?group=3`, identical) returns root
  group `id 3`, name "Women's National Basketball Assoc.", `shortName`
  "WNBA", `isConference: false`, with children `id 1` Eastern Conference
  (`E`, `isConference: true`, 7 entries) and `id 2` Western Conference
  (`W`, 8 entries): 15 entries total, matching the teams list.
- Ran `membershipFromStandings(standings, "primary")` and `buildCatalog` on the
  live data: 15 teams, 0 non-primary, each with
  `conference {id, name: "Eastern Conference"|"Western Conference", shortName E|W}`,
  no division. `subdivision` is set to "WNBA" (harmless: only `isFbs` for
  `league.key === "ncaaf"` and the picker's tier logic read it; the picker's
  search haystack uses `conference.name`).
- Standings `?season=2027` also answers (with the current structure), so
  team membership does not break in the offseason.

### Team schedule (site API)
`GET site/.../teams/20/schedule?season=2026&seasontype=N` (Atlanta Dream):

| seasontype | events | notes |
| --- | --- | --- |
| 1 | 2 | `seasonType.abbreviation: "pre"` |
| 2 | 44 | all `STATUS_FINAL` today |
| 3 | 7 | First Round G1 and G2 final; Semifinals G1 to G5 scheduled |
| 4, 5 | 0 | |
| any, `season=2027` | 0 | `requestedSeason` is absent |

- All events parse with `espnEventSchema` (0 failures across types 1 to 3).
- `event.season = {year: 2026, displayName: "2026"}`, no `week` object (so
  `hasWeeks: false` matches; `SportsCalGame.week` is undefined).
- Top-level `season` in the response always reports the current season/type
  (`type: 3 Postseason`); `requestedSeason` carries the requested one for
  non-empty results. For `season=2027` it is absent, and `buildGames` falls
  back to per-event year filtering, which is moot because `events` is empty.
- Broadcasts present (`media.shortName`, e.g. "Prime Video", "Victory+ ATL");
  some preseason games have none. Venue has `fullName` and `address.city/state`
  (no `country`).
- Postseason quirks:
  - First-round games carry `competition.type` "Round of 16" (`RD16`), later
    ones "Standard". Series info lives in `competition.notes[0].headline`
    ("First Round - Game 1", "Semifinals - Game 4 If Necessary"), which flows
    into the existing `note` field.
  - Future playoff games have `timeValid: false`, `status.type.detail` "10/4 - TBD",
    and `date` at `T04:00Z` (midnight US Eastern, EDT). `normalizeGame` marks
    them `timeTBD`; `dateInZone(..., "America/New_York")` recovers the right
    day (Oct 4). `events.ts` renders them as all-day events.
  - "If necessary" games are listed with `STATUS_SCHEDULED`, no distinguishing
    flag besides the headline text.
- Commissioner's Cup:
  - Group-play games are regular-season (`seasontype 2`) games with
    `notes[0].headline = "WNBA Commissioner's Cup"` (6 for the Dream in 2026).
  - The Cup final (2025-07-02, MIN vs IND) is also `seasontype 2`, with
    `competition.type.text = "Commissioner's Cup"` and headline
    "WNBA Commissioner's Cup Championship". It appears in both finalists'
    schedules, not in other teams'. Today it is correctly bucketed as regular
    season (no separate season type), so the "Regular season" chip includes
    it.
- All-Star Game: not present in any team schedule (Dream 2026 type 2 has
  exactly 44 games; Lynx and Fever 2025 contain no All-Star entry). Nothing to
  filter. (I did not locate the All-Star event itself on the scoreboard; no
  change needed either way.)

### Season phase today (2026-10-02)
`seasonPhase(current=2026, now)` is `active` (postseason window runs to
2026-11-01). After 2026-11-01 it becomes `completed`; `resolveLeagueSeason`
then calls `fetchSeason(2027)` (404 today), so `decideSeason` returns
`{espnSeason: 2026, status: "completed", pendingNextSeason: {espnSeason: 2027}}`.
That is exactly the existing pending-next-season fallback.

### Deviations from the zod schemas
None found: teams, standings, season and all three schedule types parse with
the existing schemas. Fields simply absent: `venue.address.country`,
`week`, divisions.

## 3. Config entry

Add `"wnba"` to `LEAGUE_KEYS` (after `"nba"` so the dropdown order groups the
basketball leagues; coordinate with the order chosen in README/other specs) and
add to `LEAGUES` in `lib/config/leagues.ts`:

```ts
wnba: {
  key: "wnba",
  sport: "basketball",
  league: "wnba",
  label: "WNBA",
  name: "Women's National Basketball Association",
  defaultDurationMinutes: 120,
  scheduleSeasonTypes: [1, 2, 3],
  seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
  // /groups carries no team ids for the WNBA; standings group 3 (the league
  // root) lists both conferences with their teams (verified 2026-10-02).
  teamGrouping: { kind: "standings", defaultGroupIds: ["3"], extendedGroupIds: [] },
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
},
```

Rationale
- Duration 120: WNBA games run roughly 2h (NBA is 150). README line "League-default
  durations" gets updated.
- No type 5: ESPN publishes no Play-In for the WNBA. If one is introduced the
  id would be added to `scheduleSeasonTypes` and `seasonTypeFallback`.
- `scheduleTimeZone`: TBD placeholders are midnight Eastern (04:00Z in EDT,
  matching the observed `T04:00Z`).
- `standings` with `defaultGroupIds: ["3"]` is a config-only choice; see
  section 4 for the fallback if a code-level source is preferred.

## 4. Code changes beyond config

| Area | File | Change |
| --- | --- | --- |
| Registry | `lib/config/leagues.ts` | Add key and entry (section 3). `LeagueKey` widens automatically. |
| Grouping adapter | `lib/espn/teams.ts` | None. `loadCatalog` standings branch plus `membershipFromStandings` handle root group 3 with two conference children. `extendedGroupIds: []` yields no secondary fetch. |
| Catalog tier | `lib/espn/teams.ts` `buildCatalog` | None. Teams found in standings get `primary`. Caveat: a team in `/teams` but missing from standings would fall to tier `other` and be hidden (standings-kind default). Mitigated by the live test in section 6; see risks. |
| ESPN schemas | `lib/espn/schemas.ts` | None. |
| Normalize | `lib/espn/normalize.ts` | None. `normalizeSeasonType` handles "Preseason", "Regular Season", "Postseason" and "Off Season"; `isFbs` is only set when `league.key === "ncaaf"`. |
| Seasons | `lib/espn/seasons.ts` | None. See edge case 5.2 for the one latent risk. |
| Schedules | `lib/espn/schedules.ts` | None. |
| Calendar/events/uid/generator | `lib/calendar/*` | None. UID is derived from event id and team; no league branching. |
| Templates / variables | `lib/calendar/templates.ts` | Line 30 description text `"League (NFL, NBA, NCAAF)"` becomes `"League (NFL, NBA, WNBA, NCAAF)"` (or a generic string; the other league specs touch the same line, so make it generic once). `league` value comes from `LEAGUES[...].label` = "WNBA". |
| Game-type options | `components/builder/game-type-options.tsx` | None. Preseason/Regular/Postseason chips apply as is. |
| Preview / schedule UI | `components/schedule/*` | None. They only use `hasWeeks`-free paths for basketball (verified no NBA/NFL strings in `components/`). |
| Team picker | `components/builder/team-picker.tsx` | None. Search haystack includes `conference.name` so "western" works. |
| League selector | `components/builder/league-selector.tsx` | Replaced by the shared dropdown (README); no WNBA-specific work. |
| Route validation | `lib/validation/calendar-config.ts`, `app/calendar/[league]/[...path]/route.ts`, `app/api/*` | None. All use `LEAGUE_KEYS`/`isLeagueKey`, so `wnba` is accepted automatically. `/api/leagues` reads `LEAGUE_LIST`. |
| DB | `lib/db/schema.ts` | None. `league` is `varchar(16)`, plain string, no enum. No migration. Existing calendar configs are unaffected. |
| Copy | `app/layout.tsx` (line 19 meta description) | "Pick an NFL, NBA, or college football team" becomes league-neutral or lists WNBA. Do once with the other league specs. |
| Copy | `README.md` (supported leagues list line 21, durations line 32) | Add WNBA and "WNBA 2h". |
| About page | `app/about/page.tsx` | None (no per-league copy; ESPN disclaimer is league-agnostic). |
| e2e helper | `tests/e2e/helpers.ts` | `pickTeam` league param type `"NFL" \| "NBA" \| "NCAAF"` gains `"WNBA"`. Interacts with the dropdown change from README. |
| Cache key | `lib/espn/teams.ts` | None. `getTeamCatalog` is keyed per `leagueKey` argument by `unstable_cache`. |

Fallback if standings grouping is rejected: leave `teamGrouping: { kind: "groups" }`
and accept a flat, un-grouped picker. This requires zero code but loses the
conference label and conference search, and it silently depends on ESPN never
adding team data to `/groups`. Not recommended.

## 5. Edge cases

1. **Single-year season naming.** `displayName` is "2026". The live-test
   regex in `tests/live/espn.test.ts` (`/^\d{4}(-\d{2})?$/`) already accepts it.
   Calendar default name "{{team}} 2026" style templates need nothing.
2. **Offseason, no 2027 data (Nov 2026 to roughly spring 2027).**
   - 2.1 After the postseason window ends, `decideSeason` returns the completed
     2026 season with `pendingNextSeason: {espnSeason: 2027}`. The builder
     shows the existing "next season pending" state; subscriptions keep serving
     the 2026 schedule until ESPN publishes 2027 (revalidate window
     `offseasonSchedule` = 3h).
   - 2.2 Latent risk: if ESPN creates the `season` object for 2027 before
     publishing events (the NBA fixtures `season-nba-2027.json` show ESPN does
     create future seasons), `fetchCurrentSeason` could flip to 2027 with phase
     `upcoming` and zero games; `resolveLeagueSeason` only looks for a "next"
     season when current is completed, so the UI would show an empty upcoming
     season. This is existing behaviour shared with every league and is not
     WNBA-specific; verify against how NBA behaves in the summer and treat as
     a risk, not a blocker.
3. **CBA/expansion uncertainty.** A delayed or shortened 2027 schedule changes
   only data, not code: `types/2/events` count stays 0 so the resolver stays on
   2026/pending. The 2026 type windows are placeholders (postseason end
   2026-11-01 vs actual Finals end), so `completed` can lag the real Finals by a
   couple of weeks; harmless (feeds just keep the shorter revalidate of 15 min).
4. **Postseason TBD times.** Future series games are `timeValid: false` at
   04:00Z. They become all-day events dated Oct 4 etc. When ESPN sets the time
   the event keeps its UID (derived from event id) and updates in place.
5. **"If necessary" games.** They are real scheduled events. They appear on the
   calendar with the headline in `note` ("Semifinals - Game 4 If Necessary").
   Cancelled ones should disappear when ESPN drops them. No special handling
   in v1.
6. **Commissioner's Cup.** Cup group games and the Cup final are regular
   season events and stay included under "Regular season". The final is only
   in the two finalists' feeds and is a normal event. Title/description get
   the headline via `note`.
7. **All-Star Game.** Not in any team schedule; nothing to filter.
8. **Expansion teams.** Present in `/teams`, standings and schedules; logos
   present. 2025 and earlier seasons for Toronto/Portland return no games
   (manual season picker for a prior year yields an empty list, which the
   existing empty-state covers). `listSeasonOptions` filters out seasons ESPN
   404s on.
9. **Team new to standings.** Any team present in `/teams` but not in
   standings (e.g. a mid-season expansion announcement) would be tier
   `other` and hidden by default. Not an issue today (15 of 15 match).
10. **Duplicate events.** Cup final and playoffs appear once per type call;
    `buildGames` dedupes by event id.

## 6. Testing

Fixtures (capture into `tests/fixtures/espn/`, following existing names):
- `teams-wnba.json` (all 15 teams)
- `standings-wnba.json` (root group 3; it is ~94 KB, trim `standings.entries[].stats` before committing)
- `groups-wnba.json` (the 129-byte `/groups` response, documents why `groups` kind is not used)
- `season-wnba-2026.json` (current, 4 types)
- `season-wnba-2027.json` (the 404 body `{"error":{"message":"no instance found","code":404}}`; check how `season-nba-2027.json` is used in `tests/unit/seasons.test.ts` and match)
- `schedule-wnba-dream-2026-pre.json`, `schedule-wnba-dream-2026-reg.json`, `schedule-wnba-dream-2026-post.json` (post includes TBD-time "if necessary" games)
- `schedule-wnba-lynx-2025-reg.json` trimmed to include the Commissioner's Cup Championship event (optional)

Unit tests
- `tests/unit/config.test.ts`: `isLeagueKey("wnba")` true; calendar-config schema accepts `league: "wnba"` (the existing "mlb" rejection case is unaffected).
- `tests/unit/espn-adapter.test.ts`:
  - `membershipFromStandings(standings-wnba, "primary")` gives 15 teams across 2 conferences, no divisions; `buildCatalog` yields 15 primary teams, all with logos and `conference.name` Eastern/Western.
  - `membershipFromGroups(groups-wnba)` returns an empty map (regression guard documenting the quirk).
  - `buildGames` on pre/reg/post Dream fixtures: counts 2/44/7 (or the trimmed counts), `week` undefined, season id 2026, display name "2026", the postseason TBD games have `timeTBD: true` and `localDate` of the Eastern calendar day.
  - Cup final is `seasonType.normalized === "regular"` and carries the championship `note`.
  - `buildGames` with a `season=2027` empty response (no `requestedSeason`) returns `[]`.
- `tests/unit/seasons.test.ts`: with `season-wnba-2026.json`, `seasonPhase` is `active` at 2026-10-02 and `completed` at 2026-11-02; with next season missing and event count 0, `decideSeason` returns `pendingNextSeason.espnSeason === 2027` and `status: "completed"`.
- `tests/unit/templates.test.ts`: `{{league}}` resolves to "WNBA" for a WNBA game; default duration of 120 produces a 2-hour `DTEND`.

Live test: add `{ league: "wnba", slug: "indiana-fever" }` to `TARGETS` in `tests/live/espn.test.ts` (displayName regex already accepts "2026"). Also add an assertion that `getTeams("wnba")` returns 15 teams, all primary and all with a `conference`, since the standings grouping depends on an unofficial endpoint.

E2E (`tests/e2e/builder.spec.ts`, `subscription.spec.ts`, `mobile.spec.ts`): after the README dropdown change, add one builder flow: choose WNBA, search "fever", select it, confirm preview shows games and the Include chips; confirm the generated feed's `X-WR-CALNAME`/events render. Use stubs under `tests/stubs` like the existing leagues if the e2e runs offline (add WNBA stub responses).

## 7. Acceptance criteria

- [ ] `wnba` in `LEAGUE_KEYS`/`LEAGUES`; typecheck passes; selector (dropdown) lists WNBA.
- [ ] Team picker lists exactly 15 WNBA teams, each with logo, grouped/searchable by Eastern/Western conference; includes Golden State Valkyries, Toronto Tempo, Portland Fire.
- [ ] `resolveLeagueSeason(LEAGUES.wnba)` returns 2026 / "2026" / `active` on 2026-10-02 and `completed` + `pendingNextSeason` 2027 after 2026-11-01 (unit tested).
- [ ] Preview and `.ics` for a team include preseason, regular season and postseason per chips; Commissioner's Cup games and the Cup final are in "Regular season".
- [ ] TBD-time playoff games render as all-day events on the correct Eastern date; if-necessary games show their note.
- [ ] Default duration is 120 minutes; `{{league}}` renders "WNBA".
- [ ] Feeds at `/calendar/wnba/...` work; unknown or old leagues still 404/reject; existing NFL/NBA/NCAAF behaviour unchanged (existing suites green).
- [ ] New fixtures and unit/live/e2e tests above added and passing; `README.md`, `app/layout.tsx` and the template variable description updated.
- [ ] No DB migration, no schema changes.

## 8. Open questions and risks

1. **Standings dependency (decision needed).** Grouping relies on `apis/v2/.../wnba/standings` group id 3. It is verified today but unofficial. A defensive option is to make `buildCatalog`'s fallback tier `primary` for non-NCAAF leagues even when membership is missing (currently the tier falls to `other` for the `standings` kind). Out of scope here unless approved.
2. **Standings `?season=` behaviour in the offseason** is only partly verified (`season=2027` returned data); `loadCatalog` passes no season, so current standings is used. Re-verify after 2026-11-01 that expansion/relocation does not reshape group ids.
3. **Season rollover race** (edge case 2.2): whether ESPN's `/season` flips to 2027 before events exist is unverified for the WNBA; observe in May 2027 and in preceding months.
4. **Postseason end date** in the core season (2026-11-01) is a placeholder; revalidate/`completed` timing is approximate. Accept or special-case.
5. **Commissioner's Cup** is included under "Regular season"; whether users want a separate toggle is a product question (not recommended for v1).
6. **"If necessary" games** appear as normal events. A future improvement is a visual tag or filter; deferred.
7. **Unverified:** the All-Star Game's ESPN representation (not in team schedules; scoreboard lookup for 2025 dates failed to parse, so only the absence from team schedules is confirmed); Play-In-like or best-of-series playoff structure changes (the 2026 postseason shows a "First Round" labelled `RD16` and "Semifinals", different from earlier years, so labels may keep changing).
8. **Name/ordering:** `LEAGUE_KEYS` position of `wnba` should be agreed with the other league specs so the dropdown order is deliberate; the template description string and layout meta copy are shared edits, so do them once.
