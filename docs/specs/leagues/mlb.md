# MLB

Status: draft. ESPN findings verified live on 2026-10-02 (postseason in progress, 2027 schedule already published).

Prerequisite: the league dropdown in [README.md](./README.md). Not re-specced here.

## 1. Summary, goals, non-goals

Add Major League Baseball (`baseball/mlb`) as the fourth league: 30 teams grouped AL/NL -> East/Central/West, spring training / regular season / postseason, subscribable feeds at `/calendar/mlb/{team-slug}.ics`.

Goals
- Mostly config (`lib/config/leagues.ts`), plus a small set of shared-code changes that MLB forces: doubleheader titles, postponed handling, large-response caching, week suppression, "Spring Training" wording.
- Correct feeds for the three hard MLB cases: doubleheaders/split-squad, postponed-with-separate-makeup, and fully-TBD-time future seasons.

Non-goals
- All-Star Game / Home Run Derby (not in team schedules: see section 2).
- Live scores, standings, probable pitchers, MiLB, WBC.
- Changing the DB schema or the saved-calendar model.

## 2. ESPN data findings

All URLs assembled by `buildEspnUrl` in `lib/espn/client.ts`. `sport=baseball`, `league=mlb`.

| Endpoint | Finding |
| --- | --- |
| `site/.../teams?limit=1000` | 30 teams, all `isActive: true`. Parses with `espnTeamsResponseSchema`. Slugs are standard (`los-angeles-dodgers`) except **`athletics`** (id 11, abbr `ATH`, `location: "Athletics"`, `name: "Athletics"`, `displayName: "Athletics"`). |
| `site/.../groups` | Works with `{kind:"groups"}`. Two top nodes (`American League` abbr `AL`, `National League` abbr `NL`), each with 3 children (`American League East` abbr `ALE`, ... `NLW`) with 5 teams each. **Nodes have no `id` field** (NFL/NBA fixtures do) so `conference.id` / `division.id` are `undefined`; `membershipFromGroups` tolerates this. Division names are the long form ("American League East"). |
| `core/.../season` | `year: 2026`, `displayName: "2026"`, start 2026-02-19, end 2026-11-12. `types.items`: `1 Spring Training (pre)`, `2 Regular Season (reg)`, `3 Postseason (post)`, `4 Off Season (off)`. Matches `seasonTypeFallback` defaults and `normalizeSeasonType` (abbr-first). |
| `core/.../seasons/2026` dates | Spring 2026-02-19..03-25; regular 03-25..09-29; postseason 09-29..11-12. So `seasonPhase` stays "active" until 2026-11-12 even though the last regular game was 09-29. |
| `core/.../seasons/2027` | Exists. Types 1-4 present. `types/2/events?limit=1` -> `count: 2431` (so `fetchSeasonEventCount` flips to 2027 after 2026-11-12). `seasons/2028` -> 404 (handled, `fetchSeason` returns null). |
| `site/.../teams/{id}/schedule?season=2026&seasontype=N` | Types 1, 2, 3 return events; **4 and 5 return `events: []`** (559 B, no `requestedSeason`). `scheduleSeasonTypes: [1, 2, 3]` is correct. `requestedSeason` is present and correct on 1-3. Without `seasontype`, `season=2027` returns nothing (default type is postseason), so the per-type loop in `fetchTeamGames` is required. |
| Event counts (LAD 2026) | type 1: 31, type 2: 163 (162 + 1 postponed original), type 3: 5 (NLDS G1-G5, including if-necessary games). All event ids unique within and across types. |
| 2027 schedule (ATH) | Type 1: 31, type 2: 162, already published. **All 162 have `timeValid: false`, `date` = `T04:00Z` (midnight EDT), `status.shortDetail: "TBD"`.** `normalizeGame` already marks `timeTBD`; `dateInZone(..., "America/New_York")` recovers the right calendar date. |
| `week` | Regular-season events carry `week: {number, text:"Week 13"}` for roughly the first third of the season, then the field disappears (null by mid-July). It is meaningless for baseball. |
| `competitions[0].type` | `Standard`, `Exhibition` (spring), `Quarterfinal` (DS), `Round of 16` (WC). Not used by the adapter. |
| `competitions[0].notes[].headline` | Postseason: `"NLDS - Game 1"`, `"NLDS - Game 4 If Necessary"`, `"NLWC - Game 3"`, `"ALWC - Game 1"`. Regular: `"Doubleheader - Game 1"` / `"Game 2"`, `"... - Makeup from July 18"`, `"Rain - Makeup date July 22"`, `"MLB World Tour: Mexico City Series"`, `"Little League Classic"`, `"Game called (rain) with 1 out in the top of the 9th"`. Spring-training notes are empty. |
| Status names seen | `STATUS_FINAL` (detail `Final`, `Final/10` etc. for extras), `STATUS_SCHEDULED`, `STATUS_POSTPONED` (`state: "post"`, `completed: false`). **`STATUS_SUSPENDED` / `STATUS_DELAYED` never appeared in the 2026 data** (unverified). |
| Venue | `fullName`, `address.city`, `address.state`; **no `country`** even abroad. Mexico City games: `fullName: "Estadio Alfredo Harp Helu"` (accented in ESPN), `address: {city: "Mexico City"}`, `neutralSite: true`. Toronto: `state: "Ontario"`. Little League Classic: Williamsport, `neutralSite: true`. 10 neutral-site event rows in the league-wide sample (5 games, each seen from both teams). |
| Broadcasts | `media.shortName` present (`FOX`, `MLB.TV`, `Peacock`). Radio entries appear with `type.shortName: "Radio"` and short names like `ERADM`; `normalizeBroadcasts` currently includes them. |
| Schema fit | Ran `espnTeamsResponseSchema`, `espnGroupsResponseSchema`, `espnSeasonSchema`, `espnScheduleResponseSchema`, `espnEventSchema` and `normalizeGame` over 361 live events (LAD types 1-3, ATH 2027): **0 parse failures, 0 null games.** No schema changes needed. |
| Response size | Team schedule type 2: **2.85-2.94 MB** per team for a completed season (completed events embed `featuredAthletes`, tickets, records); ~1.6 MB for an unplayed season; type 1 ~0.5 MB. Next's data cache refuses fetch entries over 2 MB (`node_modules/next/dist/server/lib/incremental-cache/index.js:519`). No pagination or truncation: the full season arrives in one response. |

### Doubleheaders and split squads (verified)
- Each game has its own event id. Traditional doubleheader (LAD @ NYY 2026-07-19): original game postponed 07-18 (`401816157`), makeup Game 1 `401897386` at 16:35Z (note "Doubleheader - Game 1 - Makeup from July 18"), Game 2 `401816172` at 23:20Z (note "Doubleheader - Game 2"). Both games have valid times in the data seen.
- Regular-season doubleheaders carry the "Doubleheader - Game N" note (30 Game 2 / 18 Game 1 rows league-wide, notes sometimes use an en dash: "Game 1 – Makeup from July 27"). Whether ESPN ever sets `timeValid:false` on game 2 is **unverified**.
- Spring training split-squad: LAD has two games with the same `date` (2026-02-28T20:05Z at Camelback Ranch vs CHC and at Surprise vs TEX; 2026-03-15T20:05Z). Different opponents, different ids, no notes. Spring doubleheaders carry no note.

### Postponements (verified)
- 28 postponed regular-season games league-wide. The postponed event **keeps its original id, original `date`, `STATUS_POSTPONED`**, note "Rain - Makeup date July 22". The makeup is a **separate new event id** with note "Makeup from <date>" (28 postponed vs 28 "Makeup from" events). ESPN never reuses the id with a new date.
- A shortened final game ("Game called (rain)...") is `STATUS_FINAL`; nothing to handle.

## 3. Config entry

```ts
// lib/config/leagues.ts
export const LEAGUE_KEYS = ["nfl", "nba", "ncaaf", "mlb"] as const; // final order set by README dropdown work

mlb: {
  key: "mlb",
  sport: "baseball",
  league: "mlb",
  label: "MLB",
  name: "Major League Baseball",
  defaultDurationMinutes: 180,
  scheduleSeasonTypes: [1, 2, 3],
  seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
  teamGrouping: { kind: "groups" },
  scheduleTimeZone: "America/New_York",
  hasWeeks: false,
  // new optional fields, see section 4
  preseasonLabel: "Spring Training",
  titleTemplate: "{team} {homeAwaySymbol} {opponent} {doubleheader}",
  postponedStatus: "cancelled",
},
```

Duration 180 min: 2025-26 pitch-clock games average roughly 2h40; 3h covers most extra-inning games and leaves a small buffer (the average is an estimate, not verified here). Adjustable per calendar as for other leagues.

`LeagueConfig` additions (all optional, so existing entries are untouched): `preseasonLabel?: string`, `titleTemplate?: string`, `postponedStatus?: "tentative" | "cancelled"` (default `"tentative"` = current behaviour).

## 4. Code changes beyond the config entry

| File | Change |
| --- | --- |
| `lib/config/leagues.ts` | Add `"mlb"` to `LEAGUE_KEYS`, the entry above, and the three optional `LeagueConfig` fields. |
| `lib/validation/calendar-config.ts` | `league: z.enum(LEAGUE_KEYS)` and the DB `varchar(16)` pick up `"mlb"` automatically. Add `defaultTemplates(league)` returning `{...DEFAULT_TEMPLATES, title: LEAGUES[league].titleTemplate ?? DEFAULT_TEMPLATES.title}`; use it in `defaultConfig`. `isDefaultConfig` already compares against `defaultConfig(league, ...)`, so canonical feeds keep working. |
| `components/builder/sports-calendar-builder.tsx` | Lines ~304 and ~349 use `DEFAULT_TEMPLATES.title` for the placeholder and "reset to defaults": switch to `defaultTemplates(league)`. |
| `lib/calendar/templates.ts` | Add variable `doubleheader` ("Game 1" / "Game 2" when the game is part of a doubleheader, else empty). Update `league` description to include MLB. `seasonTypeLabel`: for `preseason` return `LEAGUES[game.league].preseasonLabel ?? "Preseason"`. Empty `{doubleheader}` is already cleaned by `cleanLine`. |
| `lib/types.ts` | Add `doubleheader?: { game: number }` to `SportsCalGame`. |
| `lib/espn/normalize.ts` | (a) Only set `week` when `league.hasWeeks` (today `hasWeeks` is configured but unused; MLB would otherwise leak "Week 13"). Check NBA fixtures still pass (NBA is `hasWeeks:false`); NFL/NCAAF unchanged. (b) Parse `note` with `/^doubleheader\s*[-–—]\s*game\s*(\d)/i` into `doubleheader`. (c) `normalizeStatus`: set `suspended` detail passthrough only (see section 5); also treat `/if necessary/i` in `note` as a new `status.tentative` flag. (d) `normalizeBroadcasts`: skip entries whose `type.shortName` is "Radio" (MLB lists radio feeds ahead of TV; affects the `{broadcast}` variable for all leagues, verify NFL/NBA fixtures). |
| `lib/espn/schedules.ts` | After `buildGames` sorts: fallback doubleheader detection for games lacking the note: same selected team, same opponent id, two distinct games whose start times are within 10 h and on the same ET date -> `game: 1` for the earlier, `2` for the later. Only when both are non-TBD. Split-squad (same time, different opponents) is **not** a doubleheader. Do not dedupe on time. |
| `lib/espn/schedules.ts` `fetchTeamGames` + `lib/espn/client.ts` | Caching fix, see section 5 "Feed size". Wrap the normalized result in `unstable_cache` (as `getTeamCatalog` does) keyed by league/team/season/status, and fetch the raw schedule responses without the Next data cache plus without the `lastGood` memory map (new `espnFetchJson` option, e.g. `{ cache: "none" }`). |
| `lib/calendar/events.ts` | `eventStatus`: `postponed` -> `CANCELLED` when `LEAGUES[game.league].postponedStatus === "cancelled"`, else `TENTATIVE`; `status.tentative` (if-necessary) -> `TENTATIVE`. `eventTiming`: postponed with cancelled mode should still produce a CANCELLED all-day entry (same UID) so subscribed clients remove it; keep current all-day output. |
| `lib/calendar/uid.ts` | **None.** UID is `espn-{eventId}-{scope}@sportscal.site`; doubleheader and split-squad games have distinct event ids. |
| `lib/espn/schemas.ts` | **None** (0 failures on live data). |
| `lib/espn/seasons.ts` | **None.** Phase logic verified against live dates (section 5). |
| `lib/espn/teams.ts` | **None** for grouping (`{kind:"groups"}`; ids missing is tolerated). Optional polish: division display is "American League East"; the picker may want the short form, see open questions. |
| `components/builder/game-type-options.tsx` | Add `preseasonLabel?: string` prop (builder passes `LEAGUES[league].preseasonLabel`) so the toggle reads "Spring Training". Include key stays `preseason`. |
| `components/schedule/game-labels.tsx` | `seasonTypeShort`: preseason -> `LEAGUES[game.league].preseasonLabel ?? "Preseason"`. `StatusText` is fine ("Postponed"). |
| `components/schedule/*` other | **None** (no `hasWeeks`/`isFbs` usage outside config and `teams.ts`). Add a "Game 1/Game 2" chip only if cheap, not required. |
| `app/layout.tsx` | Metadata description lists "NFL, NBA, or college football": reword to include MLB (e.g. "an NFL, NBA, MLB, or college football team"). |
| `README.md` | Supported-leagues list, default durations ("MLB 3h"), game-types line (spring training counts as preseason). |
| `app/about/page.tsx` | **None** (no league-specific copy). |
| `app/calendar/[league]/[...path]/route.ts`, `app/api/*` | **None** (all use `isLeagueKey` / `LEAGUE_KEYS`). |
| `lib/db/schema.ts` | **None** (`league varchar(16)`). No migration. |
| `lib/validation/calendar-config.ts` overrides cap | `LIMITS.overrides = 150`; an MLB season has up to ~195 games (162 + ~31 spring + postseason). Raise to 250 or accept the limit; see open questions. |

## 5. Edge cases and handling

| Case | Handling |
| --- | --- |
| Traditional doubleheader | Two events, distinct UIDs. Default MLB title renders `Dodgers @ Yankees Game 1` / `Game 2` via `{doubleheader}` (from the ESPN note, else the fallback pairing). Without this both are identically titled. |
| Split-squad spring games | Same team, same start, different opponents: two overlapping timed events with distinct UIDs and titles. Intentionally not merged or hidden; the user can exclude one via overrides. |
| TBD game-2 time | If ESPN marks game 2 `timeValid:false`, existing logic emits an all-day event on the ET date and flips to timed under the same UID when the time is set. Unverified for game 2 specifically. |
| Fully TBD future season | After 2026-11-12 the resolver moves to 2027 (count 2431 > 0). All 162 games are all-day (`T04:00Z` midnight EDT -> ET date) until ESPN sets times; same UIDs later become timed. `dateInZone` in `America/New_York` is correct for both EDT (04:00Z) and EST (05:00Z) placeholders. 162 all-day events in a subscribed calendar is expected. |
| Postponed (rain, air quality) | ESPN keeps the original event as `STATUS_POSTPONED` and adds the makeup as a new event. With `postponedStatus: "cancelled"` the original emits `STATUS:CANCELLED`, so clients drop it and only the makeup (with note "Makeup from July 18") remains. Under the default `"tentative"` behaviour users would see a phantom all-day tentative game next to the real makeup. Unverified: a postponement whose makeup is not yet on the schedule (none present in the end-of-season data); it would briefly vanish from calendars until the makeup event appears. |
| Suspended / resumed | Not observed. `STATUS_SUSPENDED` would fall through `normalizeStatus` as a normal timed event (`state` `in`/`post`); no special handling in v1, listed as a risk. |
| If-necessary playoff games | Present as `STATUS_SCHEDULED` with note "NLDS - Game 4 If Necessary". Emit `STATUS:TENTATIVE`. Title can include `{note}` via template. What ESPN does with unneeded games (delete vs cancel) is unverified. |
| Postseason growth | Teams that have not advanced have no later-round events; the feed grows as rounds are set (verified: LAD has only NLDS now). A team that missed the playoffs returns `events: []`; `buildGames` handles empty responses. Postseason notes carry round and game number. |
| `{week}` | Suppressed for MLB (`hasWeeks:false` now enforced in `normalizeGame`). |
| International / neutral games | Mexico City and Williamsport have `neutralSite:true` so `{homeAwaySymbol}` renders "vs". Venue `country` is absent: `{venueFull}` is "Estadio Alfredo Harp Helu, Mexico City" with no state; acceptable. Tokyo/London series are not in the 2026 data (none this season), so they are unverified; same shape expected. TBD placeholder zone stays ET (ESPN's placeholders are midnight ET even for Mexico City/Tokyo games in 2027 data seen). |
| Athletics naming | ESPN name/location/displayName are all "Athletics" (no city). `{team}`="Athletics", `{teamShort}`="Athletics", `{teamFull}`="Athletics". We never use `event.name` (which reads "Athletics Athletics at ..."). Venue for 2026 home games not separately checked (West Sacramento park expected; unverified). Slug `athletics` is stable for `/calendar/mlb/athletics.ics`. |
| Feed size / cost | Raw schedule responses are 0.5 + 2.9 + <0.1 MB per team per request, over Next's 2 MB data-cache cap, so today's `espnFetchJson` would never cache the regular-season response and every feed hit would re-download ~3.4 MB x 3 requests (and each `lastGood` entry, max 500, keeps a parsed multi-MB object in memory: up to ~30 teams x 3 MB raw JSON x JS overhead). Fix: cache the *normalized* `SportsCalGame[]` (about 200 games, low hundreds of KB) with `unstable_cache`, keep raw responses out of both the Next fetch cache and `lastGood`, and give the normalized loader its own last-good fallback. Keep `REVALIDATE.activeSchedule` (15 min) / `offseasonSchedule` (3 h) windows and the `schedule:{league}:{team}` tag. |
| Event cap | See open questions (overrides limit). |

## 6. Testing

Fixtures (trim to the relevant events, following `tests/fixtures/espn/` naming and size; existing fixtures are 35-50 KB, do not commit raw 2.9 MB responses):
- `teams-mlb.json` (full 30 teams, trimmed fields)
- `groups-mlb.json` (as served, no ids)
- `season-mlb-2026.json` (postseason current type, 4 types), `season-mlb-2027.json`
- `schedule-mlb-dodgers-2026-pre.json` (include the 2026-02-28 and 2026-03-15 split-squad pairs)
- `schedule-mlb-dodgers-2026-reg.json` (trim to: opener, the 07-18 postponed + 07-19 doubleheader trio, one `Final/10` game, one early game with `week`)
- `schedule-mlb-dodgers-2026-post.json` (NLDS G1-G5 incl. "If Necessary")
- `schedule-mlb-athletics-2027-reg.json` (a handful of all-TBD `T04:00Z` games)
- `schedule-mlb-padres-2026-reg-mexico.json` (Mexico City neutral-site games)

Unit tests
- `tests/unit/espn-adapter.test.ts`: season types map (pre/reg/post, off -> other); group membership gives AL/NL conference and ALE..NLW divisions with undefined ids and 30 teams; Athletics normalization; Dodgers pre+reg+post merge, sorted, no duplicate ids; split-squad kept as two games; doubleheader numbers from notes (including en dash) and from the fallback pairing; `week` undefined for MLB; radio broadcasts excluded.
- `tests/unit/events.test.ts`: distinct UIDs for doubleheader games; postponed -> `CANCELLED` for MLB and `TENTATIVE` for NFL; if-necessary -> `TENTATIVE`; TBD 2027 games -> all-day on the ET date.
- `tests/unit/templates.test.ts`: `{doubleheader}` renders and cleans when empty; `{seasonType}` renders "Spring Training".
- `tests/unit/seasons.test.ts`: MLB resolution: 2026-10-02 -> active 2026; 2026-11-13 with 2027 events -> 2027 upcoming; before 2026-11-13 without events -> stays 2026.
- `tests/unit/config.test.ts`: **line 14 asserts `league: "mlb"` is rejected; change it to an unknown key (e.g. `"xfl"`)** and add an assertion that `defaultConfig("mlb", ...)` has `durationMinutes` 180 and the doubleheader title; unit test `defaultTemplates`.
- Caching: unit-test the normalized loader (mock `espnFetchJson`) returns the cached result without a second raw fetch.

Live (`tests/live/espn.test.ts`): add `{ league: "mlb", slug: "los-angeles-dodgers" }` and `{ league: "mlb", slug: "athletics" }` to `TARGETS`. The season `displayName` regex `^\d{4}(-\d{2})?$` fits "2026". Add an assertion that games for MLB have no `week`.

E2E
- `tests/e2e/helpers.ts`: widen `league` union to include `"MLB"`; update for the dropdown prerequisite.
- `tests/e2e/builder.spec.ts`: "MLB -> Dodgers -> schedule -> download" (also check the Spring Training toggle label and a doubleheader row if the stub schedule contains one). Stubs live in `tests/stubs/` and need an MLB stub if the e2e suite stubs ESPN.

## 7. Acceptance criteria

- [ ] "MLB" appears in the league control; picking it lists 30 teams grouped AL/NL by division.
- [ ] `/calendar/mlb/los-angeles-dodgers.ics` and `/calendar/mlb/athletics.ics` return valid ICS with spring training, regular season, and postseason games (162 + spring + postseason when present) and correct local times.
- [ ] Doubleheader games have distinct UIDs and titles ending "Game 1" / "Game 2"; non-doubleheader titles have no trailing text.
- [ ] Split-squad spring games both appear.
- [ ] Postponed games emit `STATUS:CANCELLED`; their makeups appear as normal events.
- [ ] If-necessary playoff games are `TENTATIVE`.
- [ ] No "Week N" text appears for MLB in templates or UI.
- [ ] Preseason toggle and labels read "Spring Training" for MLB only.
- [ ] After 2026-11-12 the auto season becomes 2027 and all 162 games render as all-day events on the correct dates.
- [ ] Regular-season feed requests hit the normalized cache (no repeated multi-MB ESPN downloads); memory use of the `lastGood` map stays bounded.
- [ ] Saved MLB calendars round-trip through `/api/calendars` (no DB change); existing NFL/NBA/NCAAF tests, fixtures and feeds are unchanged.
- [ ] `pnpm test`, e2e, and `pnpm test:live` pass.

## 8. Open questions and risks

1. Suspended/resumed games: ESPN representation unseen (status name, same id vs new id). Recheck during a live season; v1 treats them as normal timed events.
2. Postponed with no makeup yet: cancelling the only placeholder may confuse users. Alternative: `"tentative"` plus an auto-added "Postponed" prefix in the title. Needs a product call; `postponedStatus` makes either a one-line change.
3. If-necessary games that are not played: does ESPN remove them or mark them canceled/postponed? Check after the DS ends (week of 2026-10-05).
4. Does ESPN ever give game 2 of a traditional doubleheader `timeValid:false`? Not seen in 2026 data.
5. Tokyo / London / Seoul series: none in 2026 data; confirm country/venue shape when they appear (expect missing `country`).
6. Athletics 2026+ home venue string (Sutter Health Park / West Sacramento) not verified.
7. Division labels are long ("American League East"); the team picker UI may want "AL East" (abbreviation ALE is available). Cosmetic, can use `abbreviation` mapping later.
8. Overrides limit of 150 in `LIMITS.overrides` is below a full MLB season plus spring training; raise (and check the `calendar_configs` row size) or document the limit.
9. Defining the per-league title default means MLB saved calendars store the doubleheader title; changing the default later will make them "non-default" in `isDefaultConfig`. Acceptable but note it.
10. Radio-broadcast filtering changes `{broadcast}` output for other leagues if their feeds include radio; verify fixtures before merging.
11. ESPN is unofficial: the 2.9 MB team response and the lack of ids in `/groups` are both easy to regress on; keep the live test.
