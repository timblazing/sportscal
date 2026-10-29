import "server-only";

import type { LeagueKey } from "@/lib/config/leagues";
import { LEAGUES } from "@/lib/config/leagues";
import { fetchTeamGamesSnapshot } from "@/lib/espn/schedules";
import { resolveLeagueSeason, resolveManualSeason } from "@/lib/espn/seasons";
import { findTeam, type CatalogTeam } from "@/lib/espn/teams";
import type { ResolvedSeason, SportsCalGame } from "@/lib/types";

export class TeamNotFoundError extends Error {
  constructor(readonly league: LeagueKey, readonly team: string) {
    super(`Unknown ${LEAGUES[league].label} team: ${team}`);
    this.name = "TeamNotFoundError";
  }
}

export class SeasonNotFoundError extends Error {
  constructor(readonly season: number) {
    super(`ESPN has no ${season} season`);
    this.name = "SeasonNotFoundError";
  }
}

export interface SeasonSelection {
  seasonMode: "auto" | "manual";
  seasonOverride?: number;
}

export async function resolveSeason(
  leagueKey: LeagueKey,
  selection: SeasonSelection,
  now: Date = new Date(),
): Promise<ResolvedSeason> {
  const league = LEAGUES[leagueKey];
  if (selection.seasonMode === "manual" && selection.seasonOverride !== undefined) {
    const season = await resolveManualSeason(league, selection.seasonOverride, now);
    if (!season) throw new SeasonNotFoundError(selection.seasonOverride);
    return season;
  }
  return resolveLeagueSeason(league, now);
}

export interface LoadedSchedule {
  team: CatalogTeam;
  season: ResolvedSeason;
  games: SportsCalGame[];
  fetchedAt: string;
}

/**
 * Load config → resolve season → fetch (cached) ESPN schedule. Always runs
 * against current ESPN data; nothing about the schedule is persisted.
 */
export async function loadTeamSchedule(
  leagueKey: LeagueKey,
  teamSlugOrId: string,
  selection: SeasonSelection = { seasonMode: "auto" },
  saved = false,
): Promise<LoadedSchedule> {
  const team = await findTeam(leagueKey, teamSlugOrId, saved);
  if (!team) throw new TeamNotFoundError(leagueKey, teamSlugOrId);
  const season = await resolveSeason(leagueKey, selection);
  const snapshot = await fetchTeamGamesSnapshot(leagueKey, team.id, season);
  return { team, season, games: snapshot.value, fetchedAt: new Date(snapshot.fetchedAt).toISOString() };
}
