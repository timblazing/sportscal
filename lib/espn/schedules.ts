import { LEAGUES, type LeagueConfig, type LeagueKey } from "@/lib/config/leagues";
import type { ResolvedSeason, SportsCalGame } from "@/lib/types";
import { REVALIDATE, buildEspnUrl, espnFetchJson } from "@/lib/espn/client";
import { normalizeGame } from "@/lib/espn/normalize";
import { espnEventSchema, espnScheduleResponseSchema } from "@/lib/espn/schemas";

// ---------------------------------------------------------------------------
// Pure builder (unit tested with fixtures)
// ---------------------------------------------------------------------------

/**
 * Normalize one or more team-schedule responses (one per ESPN season type)
 * into a sorted, de-duplicated game list for `season`.
 *
 * ESPN silently answers with a different season when the requested one
 * doesn't exist, so responses whose `requestedSeason` doesn't match are
 * discarded, and each event's own season year is checked too.
 */
export function buildGames(
  responses: unknown[],
  context: { league: LeagueConfig; teamId: string; season: Pick<ResolvedSeason, "espnSeason" | "displayName"> },
): SportsCalGame[] {
  const byId = new Map<string, SportsCalGame>();
  for (const response of responses) {
    const parsed = espnScheduleResponseSchema.safeParse(response);
    if (!parsed.success) continue;
    const requested = parsed.data.requestedSeason;
    if (requested?.year !== undefined && requested.year !== context.season.espnSeason) continue;

    for (const rawEvent of parsed.data.events) {
      const event = espnEventSchema.safeParse(rawEvent);
      if (!event.success) continue;
      if (event.data.season?.year !== undefined && event.data.season.year !== context.season.espnSeason)
        continue;
      const game = normalizeGame(event.data, {
        league: context.league,
        teamId: context.teamId,
        seasonYear: context.season.espnSeason,
        seasonDisplayName: requested?.displayName ?? context.season.displayName,
      });
      if (game) byId.set(game.id, game);
    }
  }
  return [...byId.values()].sort(compareGames);
}

export function compareGames(a: SportsCalGame, b: SportsCalGame): number {
  if (a.dateTBD !== b.dateTBD) return a.dateTBD ? 1 : -1;
  const diff = Date.parse(a.startDate || "0") - Date.parse(b.startDate || "0");
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// ESPN data access
// ---------------------------------------------------------------------------

export async function fetchTeamGames(
  leagueKey: LeagueKey,
  teamId: string,
  season: ResolvedSeason,
): Promise<SportsCalGame[]> {
  const league = LEAGUES[leagueKey];
  const revalidate =
    season.status === "completed" ? REVALIDATE.offseasonSchedule : REVALIDATE.activeSchedule;
  const responses = await Promise.all(
    league.scheduleSeasonTypes.map((seasonType) =>
      espnFetchJson(
        buildEspnUrl("site", league, ["teams", teamId, "schedule"], {
          season: season.espnSeason,
          seasontype: seasonType,
        }),
        { revalidate, tags: [`schedule:${leagueKey}:${teamId}`] },
      ),
    ),
  );
  return buildGames(responses, { league, teamId, season });
}
