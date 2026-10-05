/**
 * Optional live checks against ESPN (not part of the deterministic suite).
 * Run with: pnpm test:live
 */
import { describe, expect, it } from "vitest";

import { LEAGUES } from "@/lib/config/leagues";
import { fetchTeamGames } from "@/lib/espn/schedules";
import { resolveLeagueSeason } from "@/lib/espn/seasons";
import { getTeams } from "@/lib/espn/teams";

const TARGETS = [
  { league: "nfl", slug: "pittsburgh-steelers" },
  { league: "nba", slug: "oklahoma-city-thunder" },
  { league: "wnba", slug: "indiana-fever" },
  { league: "nhl", slug: "pittsburgh-penguins" },
  { league: "ncaaf", slug: "oklahoma-sooners" },
  { league: "epl", slug: "liverpool" },
] as const;

describe.each(TARGETS)("live ESPN: $league $slug", ({ league, slug }) => {
  it("resolves a season, finds the team and loads games", { timeout: 30_000 }, async () => {
    const season = await resolveLeagueSeason(LEAGUES[league]);
    expect(season.espnSeason).toBeGreaterThan(2000);
    expect(season.displayName).toMatch(/^\d{4}(-\d{2})?$/);

    const teams = await getTeams(league);
    if (league === "wnba") {
      expect(teams).toHaveLength(15);
      expect(teams.every((team) => team.tier === "primary" && team.conference && team.logo)).toBe(true);
    }
    const team = teams.find((t) => t.slug === slug);
    expect(team).toBeDefined();

    const games = await fetchTeamGames(league, team!.id, season);
    if (league === "epl") expect(games).toHaveLength(38);
    for (const g of games) {
      expect(g.homeTeam.id === team!.id || g.awayTeam.id === team!.id).toBe(true);
    }
  });
});
