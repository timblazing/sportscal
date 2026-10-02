# NCAAB (NCAA Division I men's basketball)

Status: draft. Verified against live ESPN on 2026-10-02.
Prerequisite: the league dropdown in [README.md](./README.md). Not re-specified here.

## 1. Summary, goals, non-goals

Add `ncaab` as the fourth league. NCAAB fits the existing adapter almost unchanged. It is a straight reuse of the NCAAF `standings` grouping path, with one real gap (section 4.2) and some UX quirks around conference tournaments and TBD times.

Goals
- Pick any D-I men's team, get the same builder, preview, `.ics` download and subscription feed as the other leagues.
- Conference grouping via ESPN standings group 50.
- Correct handling of the very large share of TBD-time games (about 75% of the published 2026-27 schedule).

Non-goals
- Women's basketball (see 4.9). No `womens-college-basketball` entry in this change.
- Any new picker UI (the "show all teams" behaviour is unchanged).
- Reclassifying conference tournaments as postseason (open question 1).
- Placeholder events for unset brackets (see section 5).
- Rankings, scores beyond what `resultLabel` already renders, or odds.

## 2. ESPN data findings (live, 2026-10-02)

Slugs: sport `basketball`, league `mens-college-basketball`. `buildEspnUrl` produces correct URLs for all three APIs with no code change. `SEGMENT_RE` allows these slugs.

### Seasons (core API)
- `core/.../season` currently returns year `2027`, displayName `2026-27`, 2026-07-13 to 2027-04-07.
- Season types:

| id | name | abbr | 2026-27 window |
| --- | --- | --- | --- |
| 1 | Preseason | pre | 2026-07-13 to 2026-11-01 |
| 2 | Regular Season | reg | 2026-11-01 to 2027-03-16 |
| 3 | Postseason | post | 2027-03-16 to 2027-04-07 |
| 4 | Off Season | off | 2027-04-07 to 2026-07-13 |

- There is no type 5. `normalizeSeasonType` resolves all four through ESPN's own abbreviations, and `seasonTypeFallback` matches the NFL/NCAAF table.
- Season naming matches the NBA: year is the ending year, `displayName` is `YYYY-YY`. The live-test regex `^\d{4}(-\d{2})?$` passes.
- 2025-26 (`seasons/2026`) is complete, with postseason ending 2026-04-08.
- `seasons/2027/types/2/events?limit=1` returns `count: 0` (query params echoed `dates: 20251103`, which looks like a stale default). It is not a reliable "schedules published" signal for this league. Since `current` is already 2027 and `upcoming`, `resolveLeagueSeason` never calls `fetchSeasonEventCount` today.
- Result: with `now` = 2026-10-02, `seasonPhase` returns `upcoming` (regular season start 2026-11-01 is in the future), so the feed resolves to season 2027 / `2026-27`. ESPN has already published regular-season schedules: Duke has 33 games, and a scan of all 362 teams yields 10,948 team-games from 2026-11-01 to 2027-03-07. No conference-tournament or postseason games are published yet.

### Teams
- `teams?limit=1000` returns all 362 teams in one response (1,472,631 bytes). The default (no limit) and `limit=50` both return exactly 50, so the `limit: 1000` already set in `loadCatalog` is required.
- Pagination: no `page` handling is needed at this size. Behaviour of `page=` was not verified.
- The response is below Next's 2 MB fetch-cache cap, but only by about 25%. The `unstable_cache` wrapper around the normalized catalog in `getTeamCatalog` keeps that safe.
- Team objects match `espnTeamSchema`: `id, slug, location, name, nickname, abbreviation, displayName, shortDisplayName, color, isActive, logos`.
  - All 362 have logos, a color and an abbreviation.
  - No duplicate slugs.
  - `isActive` is true for all (no inactive filter is exercised).
- Sample: Duke id `150`, slug `duke-blue-devils`, abbreviation `DUKE`, color `#00539b`. Team ids are the same ids ESPN uses for college football (Duke is 150 in both), but slugs and URLs are per league.

### Grouping (site API v2 standings)
- `apis/v2/sports/basketball/mens-college-basketball/standings?group=50` returns root `id 50`, `name "NCAA Division I"`, `shortName "Division I"`, `isConference false`.
  - It has 31 `children` with `isConference: true`.
  - Conferences hold `standings.entries[].team`, with no nested divisions.
  - There are 365 unique team entries.
- Conference examples (the code uses `shortName`): ACC, Big Ten, Big 12, SEC, Big East, `Am. East`, `A-10`, `Atlantic Sun`, `CUSA`, `MAC`, `MVC`, `SoCon`, `WCC`.
  - ESPN's name for the MAAC is "Metro Conference" (shortName "Metro"). That is what users will see.
  - No Independents conference exists in group 50.
- `standings` with no `group` returns an empty body (no `children`). Group 52 ("NCAA Basketball") wraps group 50. Group 51 ("Non-NCAA Division I") has no children and no standings.
- `membershipFromStandings` already handles this shape, with `subdivision = root.shortName` = `"Division I"`.
- There is no meaningful FBS/FCS-style split in men's basketball: one D-I group, so `extendedGroupIds: []`.
- Verified by running `membershipFromStandings` and `buildCatalog` on the live responses (using the NCAAF config with swapped slugs): 362 catalog teams, 361 `primary`, and Duke resolved to conference `ACC`, tier `primary`.
- Quirk A: 4 teams in standings are missing from `/teams`.
  - They are Queens University (2511), Saint Francis (2598), Southern Indiana (88) and Lindenwood (2815), all recent D-I transitions.
  - Their schedules do work (`teams/2511/schedule` returned 32 games; `teams/88` returned 31).
  - Today they would be unselectable. See 4.2.
- Quirk B: 1 team in `/teams` is not in standings: West Florida Argonauts (2697, a non-D-I school). It already falls into tier `other`.

### Team schedule (`teams/{id}/schedule?season=&seasontype=`)
- Season type 1 returned 0 events in every probe (5 teams, both 2026 and 2027). No exhibitions are listed.
- Type 2 holds the regular season, and also conference tournaments and multi-team events (see Edge cases).
  - 2026 scan: 360 of 362 teams had events, 11,713 team-games, max 38 per team.
  - 2027: 10,948 team-games, max 55.
  - Events carry `week` (`Week 1` to `Week 19`), `seasonType {id 2, abbreviation reg}`, and the competition has `neutralSite`, `venue`, `broadcasts`, `notes`.
- Type 3 holds the NCAA Tournament, NIT and College Basketball Crown.
  - 2026: 107 teams with 209 team-games, max 6.
  - Events have no `week`.
  - For a team with no postseason, or a season with none yet (2027), the response has no `requestedSeason` and `events: []`, and `season` echoes the current season. `buildGames` already tolerates this: it only discards when `requestedSeason.year` is present and mismatched.
- Types 4 and 5 return nothing.
- Status names seen: `STATUS_FINAL`, `STATUS_SCHEDULED`, `STATUS_POSTPONED` (26), `STATUS_CANCELED` (5). These are handled by `normalizeStatus`.
- TBD times:
  - 8,260 of the 10,948 scheduled 2027 team-games (about 75%) have `timeValid: false`.
  - All have `date` at `T05:00Z` (midnight ET, EST at that time of year) and a `status.type.detail` like `11/2 - TBD`.
  - The status name stays `STATUS_SCHEDULED`, not `STATUS_TBD`. `normalizeGame` already catches this through `timeValid === false`.
  - The Duke 2027 check gave 26 of 33 as `timeTBD`, with `localDate` correct (first game `2026-11-02`).
- Placeholders: across about 22,000 competitor entries (2026 and 2027, types 2 and 3) there is no `TBD`, `Winner of`, or otherwise placeholder team. Unset bracket slots and later MTE rounds are simply absent from the schedule.
- Non-D-I opponents (e.g. "Cameron Aggies", "Plattsburgh Cardinals", "Champion Christian Tigers") are real competitors with an `id` and `displayName`.
  - 693 competitor entries lack `logos`.
  - 2 lack `abbreviation` (Montreat id 125710, Ottawa (KS) id 122627).
  - Some names are awkward, e.g. `Ottawa (KS) Ottawa Uni`.
  - 43 events have no `venue`.
- Notes (`competitions[0].notes[].headline`) carry the event: `Champions Classic`, `Maui Invitational`, `T. Rowe Price ACC Tournament - Semifinal`, `NCAA Men's Basketball Championship - East Region - 1st Round`, `NIT - Quarterfinal`, `College Basketball Crown - Semifinals`, `Flex Game: 2/16 or 2/17`, etc.
- Parsing check: `buildGames` on live Duke 2027 (types 2 and 3) returns 33 games (26 timeTBD, 6 neutral). Live Duke 2026 (types 2 and 3) returns 38 games, 4 postseason, ending with the NCAA East Region games. No schema failures.

## 3. Config entry

Add to `lib/config/leagues.ts`:

```ts
export const LEAGUE_KEYS = ["nfl", "nba", "ncaaf", "ncaab"] as const; // order: see README / open question 6

ncaab: {
  key: "ncaab",
  sport: "basketball",
  league: "mens-college-basketball",
  label: "NCAAB",
  name: "NCAA Division I Men's Basketball",
  defaultDurationMinutes: 120,
  // 1 (Preseason) has no events and 4 is the offseason, so query regular season (incl.
  // conference tournaments and MTEs) and postseason only.
  scheduleSeasonTypes: [2, 3],
  seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
  // ESPN group 50 = NCAA Division I (31 conferences, 365 teams). No extended split.
  teamGrouping: { kind: "standings", defaultGroupIds: ["50"], extendedGroupIds: [] },
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
},
```

Naming is consistent with NCAAF: key `ncaab`, label `NCAAB` (like `NCAAF`), name `NCAA Division I Men's Basketball` (like `NCAA Division I Football`).

Notes
- `hasWeeks` is declared but not read anywhere outside the config, so the value is documentary. `false` is correct: ESPN does emit `Week N` labels, but they are meaningless for college hoops.
- `defaultDurationMinutes: 120` follows the brief. See open question 3.
- Leaving `scheduleSeasonTypes` at `[2, 3]` saves one ESPN call per team load. Add 1 only if exhibitions appear (open question 4).

## 4. Required code changes beyond config

4.1 `lib/config/leagues.ts`: the config entry above. `LeagueKey` is derived from `LEAGUE_KEYS`, so `z.enum(LEAGUE_KEYS)` in `lib/validation/calendar-config.ts`, `app/api/teams/route.ts` and `isLeagueKey` all pick it up. No other file needs a change for the key.

4.2 `lib/espn/teams.ts` and `lib/espn/schemas.ts` (the one real change): backfill teams that appear in standings but not in `/teams` (Quirk A).
- Extend `espnStandingsNodeSchema` entries from `{ team: { id } }` to `team: espnTeamSchema`. The standings entry team carries `id, location, name, abbreviation, displayName, shortDisplayName, isActive, logos`, but no `slug`.
- `normalizeTeam` already falls back to `slugify(displayName)`. For Queens that yields `queens-university-royals`, which matches ESPN's own slug.
- Make `membershipFromStandings` also return (or record in the `Membership` map) the raw team for each entry. In `loadCatalog`, after `parseTeamsResponse`, append standings teams whose id is missing from `/teams` before calling `buildCatalog`.
- `buildCatalog` already de-dupes by id.
- This is generic and also benefits NCAAF. Keep the NCAAF `isFbs` behaviour unchanged.
- Without this, 4 of 365 D-I teams cannot be picked.
- Bump the `unstable_cache` key (`espn-team-catalog-v1` to `v2`), because the catalog shape or contents change.

4.3 `lib/types.ts` and `lib/espn/normalize.ts`: none required.
- `isFbs` stays NCAAF-only. `buildCatalog` already gates it on `league.key === "ncaaf"`, so NCAAB teams get `isFbs: undefined`.
- Nothing in the UI reads `isFbs`.
- `CatalogTeam.subdivision` will be `"Division I"` for NCAAB (the root `shortName`). Nothing in the UI reads `subdivision` either, so there is no visible effect.
- Optional cleanup, not required: update the doc comment on `CatalogTeam.subdivision` ("college football") and the `membershipFromStandings` comment ("NCAAF"), both in `lib/espn/teams.ts`.

4.4 `lib/espn/normalize.ts`, optional hardening: fall back `abbreviation` in `normalizeGameTeam` to `shortName` when ESPN omits it (2 of about 22,000 entries). Without it, `{opponentAbbr}` renders empty and `cleanLine` tidies the title. Not required for v1.

4.5 `lib/espn/schedules.ts` and `lib/espn/seasons.ts`: none. `buildGames` and `resolveLeagueSeason` handle the live shapes (empty postseason with a mismatched echo `season`; `upcoming` current season).

4.6 `lib/calendar/*` (events, templates, uid, generator, filters): none functionally.
- `buildCalendarEvents` already turns `timeTBD` into all-day events using `localDate`.
- `lib/calendar/templates.ts`: update the `league` variable description ("League (NFL, NBA, NCAAF)") to avoid a stale list. Prefer a generic wording or derive the list from `LEAGUE_LIST`. This line will be touched by every league spec, so whichever lands first fixes it.
- Event UIDs are `espn-{eventId}-{teamId}@sportscal.site`. ESPN team ids are shared with college football and the UID has no league component. ESPN event ids appear globally unique, so no collision is expected. Unverified; see open question 7.

4.7 `components/builder/*`, `components/schedule/*`: no functional change.
- `game-type-options.tsx` labels are generic. The "Postseason" chip counts only type-3 games, so conference tournaments count under "Regular season" (open question 1).
- `team-picker.tsx` already searches `conference.name` and ranks `primary` above `other`. The builder loads `/api/teams?league=ncaab&all=1`, so D-I teams are `primary` and West Florida is `other` (logo hidden). With about 360 teams, `MAX_RESULTS = 50` still holds.
- `game-labels.tsx` (`seasonTypeShort`): no change.
- `tests/e2e/helpers.ts`: widen the `league` union to include `"NCAAB"`. It must be reconciled with the dropdown change in README (the helper currently clicks by text).

4.8 UI copy and about page.
- `app/layout.tsx:19` metadata description says "Pick an NFL, NBA, or college football team". Change it to a league-agnostic phrase such as "Pick a pro or college team".
- `app/about/page.tsx`: no sport-specific copy needs changing. Optional: one line under "TBD start times" noting that college basketball schedules are mostly all-day until ESPN assigns times. Recommended, given the 75% figure.

4.9 Route validation, API routes, DB.
- `app/calendar/[league]/[...path]/route.ts`: none (uses `isLeagueKey`).
- `app/api/{teams,leagues,schedule,download,calendars}`: none (derived from `LEAGUE_KEYS` and `LEAGUE_LIST`).
- `lib/db/schema.ts`: none. `league` is `varchar(16)` and `"ncaab"` fits. There is no enum and no migration.
- `lib/validation/calendar-config.ts`: none.
- Women's basketball (future): add `ncaaw` with `sport: "basketball"`, `league: "womens-college-basketball"`, label `NCAAW`, and the same shape. The group id, season ids and team counts must be re-verified, since the D-I group id is not assumed to be 50 there. It needs no code beyond a new `LEAGUE_KEYS` entry. Team ids and slugs overlap across men's and women's (same school ids), but URLs and caches are keyed by league, so there is no clash.

## 5. Edge cases and handling

| Case | ESPN behaviour (verified) | Handling |
| --- | --- | --- |
| Time TBD (about 75% of 2027 games) | `timeValid:false`, `T05:00Z`, `STATUS_SCHEDULED`, detail `11/2 - TBD` | `normalizeGame` sets `timeTBD`, `localDate` from ET. All-day event, same UID becomes timed once ESPN publishes. No change. |
| Date in DST months | Not verified for TBD dates after 2027-03-14 (none published yet) | `dateInZone` converts the instant to ET, so both `T04:00Z` and `T05:00Z` yield the right date. Cover with a unit test. |
| Conference tournaments | In season type 2 as "Regular Season" (`T. Rowe Price ACC Tournament - Final`), neutral site, `Week 19`. None published for 2027 yet. | Included while "Regular season" is on. `{seasonType}` reads "Regular Season" and `{note}` carries the tournament round. Open question 1. |
| NCAA Tournament, First Four, NIT, College Basketball Crown | Type 3, neutral sites, round in note; CBS broadcast; no `week` | Normalized as postseason via type 3. Only games with both teams set appear. |
| Opponents not yet known (bracket not set, MTE later rounds, conference tournament seeds) | Event simply absent; no placeholder team seen in about 22k entries | No placeholder events (same policy as "Games without a date aren't added" on the about page). Games appear on the next feed refresh (15 min revalidate for active seasons). Add a unit test with a synthetic placeholder competitor to lock current behaviour (open question 2). |
| MTEs (Maui, Atlantis, Players Era, etc.) | Only matchups already determined are listed: Marquette (Atlantis) shows 2 games, others 1. Neutral site, `note` is the event name, home/away arbitrary | Template `homeAwaySymbol` renders `vs` for neutral sites. Later rounds show up as ESPN adds them. No change. |
| Neutral-site games (MTEs, tournaments, "Champions Classic", MSG/T-Mobile games) | `neutralSite: true`; one side labelled `home` | `neutralSite` propagated; `HomeAwayMark` shows "Neutral site"; `homeAway` var "Neutral". No change. |
| Non-D-I opponents | Present with id/displayName, mostly no logo, sometimes no abbreviation | Rendered by `displayName`/`shortName`. `pickLogo` returns undefined (UI already handles missing logos). Missing abbreviation yields `""` (4.4 optional). |
| Teams in standings but not `/teams` | 4 teams (Quirk A) | Backfilled from standings (4.2). |
| Non-D-I team in `/teams` | West Florida (2697), not in standings | `tier: "other"`; selectable via search, logo hidden. No change. |
| Postponed / canceled | `STATUS_POSTPONED` (26), `STATUS_CANCELED` (5) in 2026 | `normalizeStatus`; postponed becomes all-day or unscheduled, canceled stays marked canceled. No change. |
| No venue | 43 events | `normalizeVenue` returns undefined; `{venue}` renders empty. No change. |
| "Flex Game: 2/16 or 2/17" | Date set to the earlier day, TBD time, note carries the flex text | Shows as all-day with the note. No change. |
| Season boundary | Current = 2027, `upcoming`. Postseason type for a season with none returns no `requestedSeason` and echoes the current season | Handled by `buildGames` (unit test). |
| Large catalog | 1.47 MB `/teams` response | `unstable_cache` on the normalized catalog (already in place). Cache key bumped to v2 (4.2). |

## 6. Testing

Fixtures (capture to `tests/fixtures/espn/`, trimmed like the NCAAF ones; do not commit the 1.4 MB teams response)
- `teams-ncaab.json`: about 15 teams: Duke, Kansas, Saint Mary's, an Am. East team, West Florida (non-D-I), and a non-D-I opponent shape. Remove the 4 standings-only teams (Queens, Saint Francis, Southern Indiana, Lindenwood) from this fixture.
- `standings-ncaab-d1.json`: group 50, trimmed to a few conferences, including the 4 standings-only teams and one with a long name ("Metro Conference").
- `season-ncaab-2027.json`: `core/.../season` (current, upcoming) and optionally `season-ncaab-2026.json` for the completed season.
- `schedule-ncaab-duke-2027-reg.json`: regular season, TBD times, neutral MTE, tournament note.
- `schedule-ncaab-duke-2026-reg.json`: ends with ACC tournament games.
- `schedule-ncaab-duke-2026-post.json`: NCAA Tournament.
- `schedule-ncaab-duke-2027-post-empty.json`: postseason response with no `requestedSeason` and `events: []`.
- One schedule with a non-D-I opponent and missing abbreviation (e.g. `schedule-ncaab-montana-state-2027-reg.json`, trimmed).

Unit tests (extend existing files)
- `tests/unit/config.test.ts`: `ncaab` is a valid league key, `defaultConfig("ncaab", ...)` gives `durationMinutes` 120.
- `tests/unit/events.test.ts`: NCAAB default duration (next to the NCAAF 210 check).
- `tests/unit/security.test.ts`: `buildEspnUrl("site", LEAGUES.ncaab, ["teams","150","schedule"], {season:2027, seasontype:2})` produces `.../basketball/mens-college-basketball/teams/150/schedule?season=2027&seasontype=2`, and the standings and core variants.
- `tests/unit/seasons.test.ts`: `season-ncaab-2027.json` at 2026-10-02 resolves `upcoming`, 2027, `2026-27`. Add a post-end case that falls back to `completed` with `pendingNextSeason`.
- `tests/unit/espn-adapter.test.ts`:
  - `membershipFromStandings` + `buildCatalog` for NCAAB: all D-I teams `primary`, conference names correct, `isFbs` undefined, West Florida `other`, the 4 standings-only teams backfilled with correct slugs (4.2).
  - `buildGames` on the Duke fixtures: TBD becomes all-day with the right `localDate`, neutral flag set, note preserved, empty postseason is tolerated, tournament games from type 2 stay `regular`.
  - Non-D-I opponent with missing logo/abbreviation does not throw.
  - Synthetic placeholder competitor (e.g. id `-1` or "TBD") to document what `normalizeGame` does today.
- `tests/unit/ics.test.ts` or `events.test.ts`: all-day TBD event for a DST date (April/March) lands on the right day.

Live (`tests/live/espn.test.ts`)
- Add `{ league: "ncaab", slug: "duke-blue-devils" }` to `TARGETS`.
- Add a live assertion that `getTeams("ncaab", { includeAll: true })` has at least 350 teams and includes `queens-university-royals` (guards the 4.2 fix).

E2E (`tests/e2e`)
- `helpers.ts`: add `"NCAAB"` to the `pickTeam` union.
- `builder.spec.ts`: `NCAAB → Duke → schedule rows visible`, then search `kansas jayhawks` still matches (every D-I team searchable). Use `pickTeam(page, "NCAAB", "duke", "Duke Blue Devils")`.
- `subscription.spec.ts`: optionally fetch `/calendar/ncaab/duke-blue-devils.ics` and assert `BEGIN:VCALENDAR` with at least one `VEVENT` (all-day `DTSTART;VALUE=DATE` events expected).
- Update league-click steps to the new dropdown per README.

## 7. Acceptance criteria

- [ ] `LEAGUE_KEYS` / `LEAGUES` include `ncaab` with the config in section 3; `tsc`, lint and unit tests pass.
- [ ] `/api/leagues` lists NCAAB; `/api/teams?league=ncaab&all=1` returns at least 360 teams including Duke and Queens University.
- [ ] Default (non-`all`) team list contains all D-I teams (about 361+) and excludes West Florida.
- [ ] Picking Duke on 2026-10-02 shows `2026-27`, status upcoming, and about 33 games, most as all-day TBD events.
- [ ] A neutral-site game (e.g. Champions Classic) shows "Neutral site"/`vs`.
- [ ] Past season (2025-26) via manual season override shows conference tournament games (regular) and NCAA Tournament games (postseason).
- [ ] An empty postseason response (no `requestedSeason`) does not error or drop games.
- [ ] Non-D-I opponents render with no logo and do not break title/description templates.
- [ ] `/calendar/ncaab/duke-blue-devils.ics` returns a valid feed with stable UIDs across two fetches.
- [ ] No DB migration is generated. Saving a custom NCAAB calendar succeeds.
- [ ] App metadata and the `league` template variable description are not stale (no hard-coded 3-league list).
- [ ] New fixtures and tests from section 6 exist and pass; live test passes.

## 8. Open questions and risks

1. Conference tournaments are "Regular Season" in ESPN (type 2), so the "Postseason" toggle will not remove them and `{seasonType}` reads "Regular Season". Options: (a) accept ESPN's grouping (this spec); (b) reclassify type-2 games whose note matches `/Tournament|Championship/` and `week >= 19` as postseason. Product call. Not verified how 2027 ESPN will tag them once published.
2. Placeholders: no TBD opponent appears today, but when the NCAA bracket is set ESPN might publish games with placeholder competitors before teams are known. Unverified. `normalizeGame` returns `null` only when home or away is missing, so a competitor with a bogus id would currently become an event with "TBD". Decide on a guard after the 2027 First Four if needed.
3. Default duration: 120 minutes per the brief; televised games commonly run about 135. Confirm.
4. Season type 1 (preseason) returned 0 events in a 5-team sample. If ESPN ever lists exhibitions, `scheduleSeasonTypes` needs 1. Not scanned for all 362 teams.
5. Standings backfill (4.2) depends on standings entries carrying `displayName`/`logos` for all teams. Confirmed for Queens only (keys listed); not confirmed for all 4. Verify in the implementation.
6. League order in the dropdown (`LEAGUE_KEYS` order is the menu order): this spec assumes `ncaab` follows `ncaaf`. Coordinate with the other league specs.
7. Event UID has no league prefix and team ids are shared between NCAAF and NCAAB. ESPN event ids appear globally unique but this was not verified; add a cross-league check if concerned.
8. The `/teams` payload is 1.47 MB for one league. Fine under Next's 2 MB cap now, with about 25% headroom. If it grows, switch to fetching teams per conference group.
9. The 2027 schedule is already published but about 75% of times are TBD. Subscribers will see events change from all-day to timed. This is the documented TBD behavior (same UID), but expect noisy calendar updates in November through February.
10. `isFbs` remains a football-specific field on `SportsCalTeam`. Renaming to a generic subdivision flag was considered but is deferred, as no consumer uses it.
