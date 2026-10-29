import { sharedSnapshot, withUpstreamBatch } from "@/lib/cache/shared";

import { LEAGUES, type LeagueConfig, type LeagueKey } from "@/lib/config/leagues";
import type { ResolvedSeason, SportsCalGame } from "@/lib/types";
import { REVALIDATE, buildEspnUrl, espnFetchJson, EspnNotFoundError } from "@/lib/espn/client";
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
  const games = [...byId.values()].sort(compareGames);
  if (context.league.key === "mlb") markDoubleheaders(games);
  return games;
}

/** Only unambiguous, timed same-opponent pairs on the same Eastern date. */
function markDoubleheaders(games: SportsCalGame[]) {
  const pairs = new Map<string, SportsCalGame[]>();
  for (const game of games) {
    if (game.dateTBD || game.timeTBD || game.status.postponed || game.status.cancelled) continue;
    const opponent = game.selectedTeamHomeAway === "home" ? game.awayTeam : game.homeTeam;
    const key = `${game.localDate}:${opponent.id}`;
    const group = pairs.get(key) ?? [];
    group.push(game);
    pairs.set(key, group);
  }
  for (const group of pairs.values()) {
    if (group.length !== 2) continue;
    const [first, second] = group;
    const elapsed = Date.parse(second.startDate) - Date.parse(first.startDate);
    if (elapsed <= 0 || elapsed > 10 * 60 * 60 * 1000) continue;
    first.doubleheader ??= { game: 1 };
    second.doubleheader ??= { game: 2 };
  }
}

export function compareGames(a: SportsCalGame, b: SportsCalGame): number {
  if (a.dateTBD !== b.dateTBD) return a.dateTBD ? 1 : -1;
  const diff = Date.parse(a.startDate || "0") - Date.parse(b.startDate || "0");
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// ESPN data access
// ---------------------------------------------------------------------------

export async function fetchTeamGamesSnapshot(
  leagueKey: LeagueKey,
  teamId: string,
  season: ResolvedSeason,
) {
  const league = LEAGUES[leagueKey];
  const revalidate =
    season.status === "completed" ? REVALIDATE.offseasonSchedule : REVALIDATE.activeSchedule;
  const key = `schedule:${leagueKey}:${teamId}:${season.espnSeason}:${season.status}`;
  const fetchAndBuild = async () => {
    const queries = (league.scheduleQueries ?? league.scheduleSeasonTypes.map((seasontype) => ({ seasontype })))
      .filter((query) => season.status !== "completed" || !("fixture" in query && query.fixture === true));
    // Two upstream calls at a time even for MLS's 32 result/fixture queries.
    // Only an explicit unpublished optional round (404) is safe to omit.
    // Timeout/429/503/malformed optional data must retain the complete snapshot.
    const responses: unknown[] = [];
    await withUpstreamBatch(queries.length, async () => {
    for (let i = 0; i < queries.length; i += 2) {
      const batch = queries.slice(i, i + 2);
      const results = await Promise.allSettled(batch.map((query) => espnFetchJson(
        buildEspnUrl("site", league, ["teams", teamId, "schedule"], {
          season: season.espnSeason, ...query,
        }), { revalidate, cache: "none" },
      )));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") responses.push(result.value);
        else if (!(result.reason instanceof EspnNotFoundError) ||
          batch[index].seasontype === league.regularSeasonTypeId) throw result.reason;
      });
    }
    });
    // Distinguish malformed upstream responses from genuinely empty schedules.
    for (const response of responses) espnScheduleResponseSchema.parse(response);
    return buildGames(responses, { league, teamId, season });
  };
  return sharedSnapshot(key, revalidate, fetchAndBuild);
}

export async function fetchTeamGames(
  leagueKey: LeagueKey, teamId: string, season: ResolvedSeason,
): Promise<SportsCalGame[]> {
  return (await fetchTeamGamesSnapshot(leagueKey, teamId, season)).value;
}
