import type { LeagueConfig } from "@/lib/config/leagues";
import type { ResolvedSeason, SeasonOption, SeasonStatus } from "@/lib/types";
import {
  REVALIDATE,
  EspnNotFoundError,
  buildEspnUrl,
  espnFetchJson,
} from "@/lib/espn/client";
import { normalizeSeason } from "@/lib/espn/normalize";
import { espnPagedCountSchema, espnSeasonSchema } from "@/lib/espn/schemas";
import type { SeasonMeta, SeasonResolverInput } from "@/lib/espn/types";

// ---------------------------------------------------------------------------
// Pure decision logic (unit tested with fixtures)
// ---------------------------------------------------------------------------

function toMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Start of the regular season (falls back to the season start). */
export function regularSeasonStart(season: SeasonMeta): number | undefined {
  const starts = season.types
    .filter((t) => t.normalized === "regular")
    .map((t) => toMs(t.startDate))
    .filter((v): v is number => v !== undefined);
  return starts.length ? Math.min(...starts) : toMs(season.startDate);
}

/** End of the last game window (postseason end), ignoring the offseason type. */
export function competitiveSeasonEnd(season: SeasonMeta): number | undefined {
  const ends = season.types
    .filter((t) => t.normalized !== "other")
    .map((t) => toMs(t.endDate))
    .filter((v): v is number => v !== undefined);
  return ends.length ? Math.max(...ends) : toMs(season.endDate);
}

export function seasonPhase(season: SeasonMeta, now: Date): SeasonStatus {
  const t = now.getTime();
  const start = regularSeasonStart(season);
  const end = competitiveSeasonEnd(season);
  if (start !== undefined && t < start) return "upcoming";
  if (end === undefined || t <= end) return "active";
  return "completed";
}

/**
 * Decide which season a calendar should show.
 *
 * 1. If ESPN's current season is upcoming or in progress, use it.
 * 2. If it has finished and ESPN has published games for the next season,
 *    move to the next season.
 * 3. Otherwise stay on the latest completed season and report that the next
 *    one is pending, so the UI never implies an old season is upcoming.
 */
export function decideSeason(input: SeasonResolverInput, now: Date): ResolvedSeason {
  const { current, next, nextEventCount = 0 } = input;
  const phase = seasonPhase(current, now);
  if (phase !== "completed") {
    return { espnSeason: current.year, displayName: current.displayName, status: phase };
  }
  if (next && nextEventCount > 0) {
    const nextPhase = seasonPhase(next, now);
    return { espnSeason: next.year, displayName: next.displayName, status: nextPhase };
  }
  return {
    espnSeason: current.year,
    displayName: current.displayName,
    status: "completed",
    pendingNextSeason: { espnSeason: current.year + 1, displayName: next?.displayName },
  };
}

// ---------------------------------------------------------------------------
// ESPN data access
// ---------------------------------------------------------------------------

export async function fetchCurrentSeason(league: LeagueConfig): Promise<SeasonMeta> {
  const url = buildEspnUrl("core", league, ["season"]);
  const data = await espnFetchJson(url, { revalidate: REVALIDATE.seasons });
  return normalizeSeason(espnSeasonSchema.parse(data), league);
}

export async function fetchSeason(league: LeagueConfig, year: number): Promise<SeasonMeta | null> {
  const url = buildEspnUrl("core", league, ["seasons", year]);
  try {
    const data = await espnFetchJson(url, { revalidate: REVALIDATE.seasons });
    return normalizeSeason(espnSeasonSchema.parse(data), league);
  } catch (error) {
    if (error instanceof EspnNotFoundError) return null;
    throw error;
  }
}

/** Count of regular-season events ESPN lists for a season (0 when unpublished). */
export async function fetchSeasonEventCount(league: LeagueConfig, year: number): Promise<number> {
  const url = buildEspnUrl("core", league, ["seasons", year, "types", 2, "events"], { limit: 1 });
  try {
    const data = await espnFetchJson(url, { revalidate: REVALIDATE.seasons });
    return espnPagedCountSchema.parse(data).count;
  } catch (error) {
    if (error instanceof EspnNotFoundError) return 0;
    throw error;
  }
}

export async function resolveLeagueSeason(
  league: LeagueConfig,
  now: Date = new Date(),
): Promise<ResolvedSeason> {
  const current = await fetchCurrentSeason(league);
  if (seasonPhase(current, now) !== "completed") {
    return decideSeason({ current }, now);
  }
  const next = await fetchSeason(league, current.year + 1);
  const nextEventCount = next ? await fetchSeasonEventCount(league, next.year) : 0;
  return decideSeason({ current, next, nextEventCount }, now);
}

/** Seasons offered in the manual override menu, newest first. */
export async function listSeasonOptions(
  league: LeagueConfig,
  resolved: ResolvedSeason,
  count = 5,
): Promise<SeasonOption[]> {
  const years = Array.from({ length: count }, (_, i) => resolved.espnSeason - i);
  const metas = await Promise.allSettled(years.map((y) => fetchSeason(league, y)));
  const options: SeasonOption[] = [];
  metas.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      options.push({ espnSeason: result.value.year, displayName: result.value.displayName });
    } else if (years[i] === resolved.espnSeason) {
      options.push({ espnSeason: resolved.espnSeason, displayName: resolved.displayName });
    }
  });
  return options;
}

/** Resolve a specific (manually chosen) season's display metadata. */
export async function resolveManualSeason(
  league: LeagueConfig,
  year: number,
  now: Date = new Date(),
): Promise<ResolvedSeason | null> {
  const meta = await fetchSeason(league, year);
  if (!meta) return null;
  return { espnSeason: meta.year, displayName: meta.displayName, status: seasonPhase(meta, now) };
}
