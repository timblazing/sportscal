# League expansion specs

One spec per league. Each can ship independently; whichever lands first also
carries the shared prerequisite below.

| League | Spec | ESPN slug |
| --- | --- | --- |
| NHL | [nhl.md](./nhl.md) | `hockey/nhl` |
| MLB | [mlb.md](./mlb.md) | `baseball/mlb` |
| WNBA | [wnba.md](./wnba.md) | `basketball/wnba` |
| MLS | [mls.md](./mls.md) | `soccer/usa.1` |
| Premier League | [epl.md](./epl.md) | `soccer/eng.1` |
| NCAAB (men's) | [ncaab.md](./ncaab.md) | `basketball/mens-college-basketball` |

## Shared prerequisite: league dropdown

`components/builder/league-selector.tsx` is a 3-column segmented radio control
sized for NFL/NBA/NCAAF. It does not scale to 9 leagues. Until a dedicated
design spec replaces it, swap it for the existing shadcn `Select`
(`components/ui/select.tsx`):

- Same props (`value`, `onChange`) so `sports-calendar-builder.tsx` is untouched.
- Visible label "League"; trigger shows `league.label`; each item shows
  `label` with `name` as secondary text.
- Order follows `LEAGUE_KEYS` in `lib/config/leagues.ts`.
- Keyboard and screen-reader behaviour come from Radix Select; update e2e
  tests (`tests/e2e/builder.spec.ts`, `mobile.spec.ts`) that click the radios.

This is a stopgap — no new visual design, no grouping by sport, no search.

## Cross-league notes

Findings that touch more than one spec — build once, in the first spec that
needs them:

- **Soccer-shared (EPL + MLS):** `scheduleQueries` (`fixture=true` for upcoming
  matches), `regularSeasonTypeId` for `fetchSeasonEventCount`, name-derived team
  slugs (ESPN slugs like `eng.man_city` fail the `^[a-z0-9-]+$` checks),
  config-driven `gameTypes` chips, per-league `defaultTemplates` ("Home v Away"),
  `drawLabel`, and template times in the league's time zone. `epl.md` is the
  source of truth; `mls.md` lists where MLS diverges.
- **Grouping:** WNBA uses `standings` (its `/groups` has no teams); EPL adds
  `flat`; MLS adds `conferenceStandings`; NHL, MLB use `groups`; NCAAB reuses
  NCAAF's `standings`.
- **`hasWeeks` is unread today.** MLB proposes making `normalizeGame` honor it
  (ESPN emits meaningless "Week N" for baseball).
- **Hard-coded league lists** in `app/layout.tsx` metadata, the about page, the
  `league` template-variable description, and `tests/unit/config.test.ts`
  (asserts `"mlb"` is rejected) need updating with the first new league.
- **Payload size:** MLB team schedules are ~2.9 MB, over Next's 2 MB fetch-cache
  cap — see `mlb.md` before adding any high-volume league.
