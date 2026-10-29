import { sharedLoad } from "@/lib/cache/shared";
import type { LeagueConfig } from "@/lib/config/leagues";
import type { ResolvedSeason, SeasonStatus } from "@/lib/types";
import { REVALIDATE, buildEspnUrl, espnFetchJson } from "@/lib/espn/client";
import { normalizeScoreboardSeason, type ScoreboardSeason } from "@/lib/espn/normalize";
import { espnScoreboardSchema } from "@/lib/espn/schemas";
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

function espnDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

/** A date inside `year`'s season: the middle of `known`'s season, shifted by whole years. */
export function probeDate(known: SeasonMeta, year: number): Date {
  const start = regularSeasonStart(known) ?? toMs(known.startDate);
  const end = competitiveSeasonEnd(known) ?? toMs(known.endDate);
  const middle =
    start !== undefined && end !== undefined
      ? new Date((start + end) / 2)
      : new Date(Date.UTC(known.year, 6, 1));
  middle.setUTCFullYear(middle.getUTCFullYear() + year - known.year);
  return middle;
}

/** The season ESPN's scoreboard reports for a date, or for today without one. */
async function fetchScoreboardSeason(league: LeagueConfig, date?: Date): Promise<ScoreboardSeason> {
  const url = buildEspnUrl("site", league, ["scoreboard"], { dates: date ? espnDate(date) : undefined });
  return sharedLoad(`season:${league.key}:${date ? espnDate(date) : "current"}`, REVALIDATE.seasons, async () => {
    const data = await espnFetchJson(url, { revalidate: REVALIDATE.seasons });
    return normalizeScoreboardSeason(espnScoreboardSchema.parse(data), league);
  });
}

export async function fetchCurrentSeason(league: LeagueConfig): Promise<SeasonMeta> {
  return (await fetchScoreboardSeason(league)).season;
}

/**
 * Look up another season through a date inside it. ESPN answers with the
 * current season when that year isn't published, which reads as `null`.
 */
export async function fetchSeason(
  league: LeagueConfig,
  current: SeasonMeta,
  year: number,
): Promise<ScoreboardSeason | null> {
  if (year === current.year) return { season: current, publishedSlots: 1 };
  const found = await fetchScoreboardSeason(league, probeDate(current, year));
  return found.season.year === year ? found : null;
}

export async function resolveLeagueSeason(
  league: LeagueConfig,
  now: Date = new Date(),
): Promise<ResolvedSeason> {
  const current = await fetchCurrentSeason(league);
  if (seasonPhase(current, now) !== "completed") {
    return decideSeason({ current }, now);
  }
  const next = await fetchSeason(league, current, current.year + 1);
  return decideSeason({ current, next: next?.season, nextEventCount: next?.publishedSlots ?? 0 }, now);
}

/** Resolve a specific (manually chosen) season's display metadata. */
export async function resolveManualSeason(
  league: LeagueConfig,
  year: number,
  now: Date = new Date(),
): Promise<ResolvedSeason | null> {
  const current = await fetchCurrentSeason(league);
  const found = await fetchSeason(league, current, year);
  if (!found) return null;
  const meta = found.season;
  return { espnSeason: meta.year, displayName: meta.displayName, status: seasonPhase(meta, now) };
}
