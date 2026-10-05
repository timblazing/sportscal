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
  { league: "mlb", slug: "los-angeles-dodgers" },
  { league: "mlb", slug: "athletics" },
  { league: "ncaab", slug: "duke-blue-devils" },
  { league: "mls", slug: "san-diego-fc" },
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
    if (league === "mls") {
      expect(teams).toHaveLength(30);
      expect(teams.filter((t) => t.conference?.name === "Western Conference")).toHaveLength(15);
      expect(teams.filter((t) => t.conference?.name === "Eastern Conference")).toHaveLength(15);
      expect(games.filter((g) => g.seasonType.normalized === "regular")).toHaveLength(34);
      const month = new Date().getUTCMonth();
      if (season.status === "active" && month >= 7 && month <= 9) {
        expect(games.some((g) => g.status.completed)).toBe(true);
        expect(games.some((g) => !g.status.completed)).toBe(true);
      }
    }
    if (league === "epl") expect(games).toHaveLength(38);
    for (const g of games) {
      if (league === "mlb") expect(g.week).toBeUndefined();
      expect(g.homeTeam.id === team!.id || g.awayTeam.id === team!.id).toBe(true);
    }
  });
});

describe("live NCAAB D-I catalog", () => {
  it("backfills all four standings-only teams and excludes non-D-I teams by default", { timeout: 30_000 }, async () => {
    const teams = await getTeams("ncaab", { includeAll: true });
    const primary = await getTeams("ncaab");
    expect(teams.length).toBeGreaterThanOrEqual(350);
    expect(primary.length).toBeGreaterThanOrEqual(360);
    for (const id of ["2511", "2598", "88", "2815"]) {
      expect(primary.find((t) => t.id === id)).toMatchObject({ tier: "primary" });
    }
    expect(teams.find((t) => t.slug === "queens-university-royals")).toBeDefined();
    expect(primary.some((t) => t.id === "2697")).toBe(false);
    expect(teams.find((t) => t.id === "2697")?.tier).toBe("other");
  });
});
