# WNBA fixture provenance

Captured from ESPN on 2026-10-05. Unused metadata, statistics, athletes, tickets, and non-default logo variants were removed; event counts and adapter fields are retained.

- `teams-wnba.json`: site v2 `basketball/wnba/teams`, all 15 active teams.
- `groups-wnba.json`: site v2 `basketball/wnba/groups`, no team memberships.
- `standings-wnba.json`: site `apis/v2/sports/basketball/wnba/standings?group=3`, two conferences with 7/8 entries; stats and unused team metadata trimmed.
- `season-wnba-2026.json` and `season-wnba-2027.json`: core v2 `basketball/leagues/wnba/seasons/{year}`; 2027 is the actual 404 error body.
- Dream schedules: site v2 `basketball/wnba/teams/20/schedule?season=2026&seasontype={1,2,3}`, retaining 2/44/7 events. Semifinals 1–3 now have published times; games 4/5 remain TBD and if necessary.
- Dream 2027 empty schedule: the same endpoint with `season=2027&seasontype=2`, with no `requestedSeason`.
- Lynx 2025 schedule: `teams/8/schedule?season=2025&seasontype=2`, trimmed to the Commissioner's Cup Championship event.
