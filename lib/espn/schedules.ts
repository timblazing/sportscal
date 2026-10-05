import { unstable_cache } from "next/cache";

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

// Store only normalized games, never multi-megabyte ESPN responses. Failed
// refreshes throw through Next's cache; fallback is outside the cached loader
// so transient failures cannot replace a successful cache entry with stale data.
const lastGoodSchedules = new Map<string, SportsCalGame[]>();
const LAST_GOOD_SCHEDULES_MAX = 100;

export async function fetchTeamGames(
  leagueKey: LeagueKey,
  teamId: string,
  season: ResolvedSeason,
): Promise<SportsCalGame[]> {
  const league = LEAGUES[leagueKey];
  const revalidate =
    season.status === "completed" ? REVALIDATE.offseasonSchedule : REVALIDATE.activeSchedule;
  const keyParts = ["espn-normalized-schedule-v1", leagueKey, teamId,
    String(season.espnSeason), season.status, season.displayName];
  const key = JSON.stringify(keyParts);
  const cached = unstable_cache(async () => {
    const queries = league.scheduleQueries ?? league.scheduleSeasonTypes.map((seasontype) => ({ seasontype }));
    const responses = await Promise.all(
      queries.map((query) => espnFetchJson(
        buildEspnUrl("site", league, ["teams", teamId, "schedule"], {
          season: season.espnSeason,
          ...query,
        }),
        { revalidate, cache: "none" },
      )),
    );
    // Distinguish malformed upstream responses from genuinely empty schedules.
    for (const response of responses) espnScheduleResponseSchema.parse(response);
    return buildGames(responses, { league, teamId, season });
  }, keyParts, { revalidate, tags: [`schedule:${leagueKey}:${teamId}`] });

  try {
    const games = await cached();
    lastGoodSchedules.delete(key);
    lastGoodSchedules.set(key, games);
    if (lastGoodSchedules.size > LAST_GOOD_SCHEDULES_MAX) {
      lastGoodSchedules.delete(lastGoodSchedules.keys().next().value!);
    }
    return games;
  } catch (error) {
    const fallback = lastGoodSchedules.get(key);
    if (fallback) return fallback;
    throw error;
  }
}
