# MLS fixtures

Captured from ESPN on 2026-10-05. Arrays of links/logos, statistics, athletes,
leaders and core reference URLs are omitted; schedule events and season types
are retained. These are observed payloads, not synthetic schedules.

- Teams/groups: site v2 `soccer/usa.1/teams?limit=1000` and `/groups`.
- Standings: v2 `soccer/usa.1/standings` without a group filter.
- Season: core `soccer/leagues/usa.1/seasons/2026` (18 types).
- San Diego: team 22529, `season=2026&seasontype=1`, with and without
  `fixture=true` (27 results + 7 fixtures).
- Wrong-season response: team 22529, `season=2025&fixture=true`, returning 2026.
- Miami: team 20232, `season=2025`, types 1, 7, 13, 15, 17 and empty type 5
  (34 regular games + six playoff games).

Penalty winner flags in the unit test are explicitly synthetic. Real soccer
penalty, TBD and postponed payloads remain unverified; no speculative status
mapping is added.
