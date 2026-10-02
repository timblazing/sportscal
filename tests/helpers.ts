import { readFileSync } from "node:fs";
import path from "node:path";

import { LEAGUES, type LeagueKey } from "@/lib/config/leagues";
import { buildGames } from "@/lib/espn/schedules";
import type { SportsCalGame } from "@/lib/types";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures/espn", name), "utf8"));
}

export function gamesFromFixtures(
  league: LeagueKey,
  teamId: string,
  season: { espnSeason: number; displayName: string },
  files: string[],
): SportsCalGame[] {
  return buildGames(files.map(fixture), { league: LEAGUES[league], teamId, season });
}

export const steelersGames = () =>
  gamesFromFixtures("nfl", "23", { espnSeason: 2026, displayName: "2026" }, [
    "schedule-nfl-steelers-2026-pre.json",
    "schedule-nfl-steelers-2026-reg.json",
    "schedule-nfl-steelers-2026-post-empty.json",
  ]);

export const thunderPlayoffGames = () =>
  gamesFromFixtures("nba", "25", { espnSeason: 2026, displayName: "2025-26" }, [
    "schedule-nba-thunder-2026-post.json",
  ]);

export const soonersGames = () =>
  gamesFromFixtures("ncaaf", "201", { espnSeason: 2026, displayName: "2026" }, [
    "schedule-ncaaf-sooners-2026-reg.json",
  ]);

export const nhlPenguinsGames = () =>
  gamesFromFixtures("nhl", "16", { espnSeason: 2026, displayName: "2025-26" }, [
    "schedule-nhl-penguins-2026-reg.json",
    "schedule-nhl-penguins-2026-post.json",
  ]);

export const nhlPenguinsUpcomingGames = () =>
  gamesFromFixtures("nhl", "16", { espnSeason: 2027, displayName: "2026-27" }, [
    "schedule-nhl-penguins-2027-pre.json",
    "schedule-nhl-penguins-2027-reg.json",
    "schedule-nhl-penguins-2027-post-empty.json",
  ]);
