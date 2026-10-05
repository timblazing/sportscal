/**
 * Small mapping functions from ESPN's raw shapes to SportsCal's normalized
 * model. Every optional field degrades to `undefined`/empty rather than
 * throwing — a missing broadcast or venue must never break a calendar.
 */
import type { LeagueConfig, NormalizedSeasonType } from "@/lib/config/leagues";
import type { GameTeam, SportsCalGame, SportsCalTeam } from "@/lib/types";
import type {
  EspnBroadcast,
  EspnCompetitor,
  EspnEvent,
  EspnSeason,
  EspnTeam,
  EspnVenue,
} from "@/lib/espn/schemas";
import type { SeasonMeta, SeasonTypeMeta } from "@/lib/espn/types";
import { slugify } from "@/lib/utils/slug";

export function pickLogo(team: Pick<EspnTeam, "logos" | "logo">): string | undefined {
  const logos = team.logos ?? [];
  const preferred =
    logos.find((l) => l.rel?.includes("dark") && l.rel.includes("default")) ??
    logos.find((l) => l.rel?.includes("dark") && !l.rel.includes("scoreboard")) ??
    logos.find((l) => l.rel?.includes("default")) ??
    logos[0];
  const href = preferred?.href ?? team.logo;
  return href && href.startsWith("https://") ? href : undefined;
}

function cleanColor(color?: string): string | undefined {
  return color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : undefined;
}

export function normalizeTeam(
  raw: EspnTeam,
  league: LeagueConfig,
  extra: Pick<SportsCalTeam, "conference" | "division" | "isFbs"> = {},
): SportsCalTeam {
  const displayName =
    raw.displayName || [raw.location, raw.name].filter(Boolean).join(" ") || raw.id;
  const location = raw.location ?? raw.shortDisplayName ?? displayName;
  const soccer = league.sport === "soccer";
  return {
    id: raw.id,
    slug: soccer ? slugify(displayName) || raw.id : raw.slug || slugify(displayName) || raw.id,
    name: soccer ? raw.shortDisplayName ?? raw.displayName ?? displayName : raw.name ?? raw.nickname ?? displayName,
    shortName: raw.shortDisplayName ?? (soccer ? raw.displayName : raw.nickname) ?? raw.name ?? displayName,
    displayName,
    location,
    abbreviation: raw.abbreviation ?? "",
    logo: pickLogo(raw),
    color: cleanColor(raw.color),
    league: league.key,
    ...extra,
  };
}

function normalizeScore(score: EspnCompetitor["score"]): string | undefined {
  if (score === undefined) return undefined;
  if (typeof score === "string") return score || undefined;
  return score.displayValue ?? (score.value !== undefined ? String(score.value) : undefined);
}

export function normalizeGameTeam(competitor: EspnCompetitor, league?: LeagueConfig): GameTeam {
  const t = competitor.team;
  const displayName = t.displayName ?? [t.location, t.name ?? t.nickname].filter(Boolean).join(" ");
  const soccer = league?.sport === "soccer" || Boolean(t.slug?.includes("."));
  return {
    id: t.id,
    name: soccer ? t.shortDisplayName ?? t.displayName ?? displayName : t.name ?? t.nickname ?? t.shortDisplayName ?? displayName,
    shortName: t.shortDisplayName ?? (soccer ? t.displayName : t.nickname) ?? t.location ?? displayName,
    displayName: displayName || t.abbreviation || "TBD",
    location: t.location ?? t.shortDisplayName ?? displayName,
    abbreviation: t.abbreviation ?? "",
    logo: pickLogo(t),
    score: normalizeScore(competitor.score),
    winner: competitor.winner,
  };
}

/**
 * Map ESPN's season type to a normalized value. ESPN's own abbreviation/name is
 * preferred ("pre", "reg", "post", "Play-In Season"); the league's numeric
 * fallback table is only consulted when those are absent or unfamiliar.
 */
export function normalizeSeasonType(
  input: { id?: string | number; abbreviation?: string; name?: string },
  league: LeagueConfig,
): NormalizedSeasonType {
  const abbr = input.abbreviation?.toLowerCase();
  const name = input.name?.toLowerCase() ?? "";
  if (abbr === "pre" || name.startsWith("preseason") || name.startsWith("pre-season"))
    return "preseason";
  if (abbr === "reg" || name === "regular season") return "regular";
  if (abbr === "post" || name.includes("postseason") || name.includes("play-in") || name.includes("playoff"))
    return "postseason";
  if (abbr === "off" || name.includes("off season") || name.includes("offseason")) return "other";
  if (input.id !== undefined) return league.seasonTypeFallback[String(input.id)] ?? "other";
  return "other";
}

export function normalizeSeason(raw: EspnSeason, league: LeagueConfig): SeasonMeta {
  const types: SeasonTypeMeta[] = (raw.types?.items ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? `Season type ${t.id}`,
    normalized: normalizeSeasonType(t, league),
    startDate: t.startDate,
    endDate: t.endDate,
  }));
  const seasonName = shortSeasonLabel(raw.displayName, raw.abbreviation, [league.name, league.label]);
  return {
    year: raw.year,
    displayName: seasonName || raw.displayName || String(raw.year),
    startDate: raw.startDate,
    endDate: raw.endDate,
    types,
  };
}

function shortSeasonLabel(displayName: string | undefined, abbreviation: string | undefined, leagueNames: string[]): string | undefined {
  if (abbreviation && /^\d{4}(-\d{2,4})?$/.test(abbreviation)) return abbreviation;
  const suffix = leagueNames.map((name) => ` ${name}`).find((suffix) => displayName?.toLowerCase().endsWith(suffix.toLowerCase()));
  return displayName && suffix
    ? displayName.slice(0, -suffix.length)
    : undefined;
}

export function normalizeBroadcasts(broadcasts: EspnBroadcast[] | undefined): string[] {
  const names = new Set<string>();
  for (const b of broadcasts ?? []) {
    if (b.type?.shortName?.toLowerCase() === "radio") continue;
    const list = b.media?.shortName ? [b.media.shortName] : (b.names ?? []);
    for (const name of list) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return [...names];
}

export function normalizeVenue(venue: EspnVenue | undefined): SportsCalGame["venue"] {
  if (!venue) return undefined;
  const result = {
    name: venue.fullName?.trim() || undefined,
    city: venue.address?.city?.trim() || undefined,
    state: venue.address?.state?.trim() || undefined,
    country: venue.address?.country?.trim() || undefined,
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

/** ESPN timestamps omit seconds ("2026-10-18T17:00Z"); normalize to full ISO. */
export function normalizeTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** Calendar date (YYYY-MM-DD) of an instant in the league's schedule time zone. */
export function dateInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeStatus(event: EspnEvent, note?: string): SportsCalGame["status"] {
  const type = event.competitions[0]?.status?.type;
  const name = type?.name?.toUpperCase() ?? "";
  const state = type?.state === "in" || type?.state === "post" ? type.state : "pre";
  const cancelled = name.includes("CANCEL");
  const postponed = name.includes("POSTPONE");
  return {
    state,
    completed: Boolean(type?.completed) && !cancelled && !postponed,
    ...(cancelled ? { cancelled } : {}),
    ...(postponed ? { postponed } : {}),
    ...(/if necessary/i.test(note ?? "") ? { tentative: true } : {}),
    detail: type?.detail ?? type?.shortDetail ?? type?.description,
  };
}

function findEspnUrl(event: EspnEvent): string | undefined {
  const links = event.links ?? [];
  const link =
    links.find((l) => l.rel?.includes("summary") && l.rel.includes("desktop")) ??
    links.find((l) => l.rel?.includes("desktop") && l.rel.includes("event"));
  return link?.href?.startsWith("https://") ? link.href : undefined;
}

/**
 * Normalize one ESPN schedule event from the perspective of `teamId`.
 * Returns null when the event can't be interpreted (e.g. no competitors).
 */
export function normalizeGame(
  event: EspnEvent,
  context: { league: LeagueConfig; teamId: string; seasonYear: number; seasonDisplayName: string },
): SportsCalGame | null {
  const { league, teamId } = context;
  const competition = event.competitions[0];
  if (!competition) return null;

  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const selected =
    home.team.id === teamId ? "home" : away.team.id === teamId ? "away" : null;
  if (!selected) return null;

  const startDate = normalizeTimestamp(competition.date ?? event.date);
  const dateTBD = !startDate;
  const timeValid = competition.timeValid ?? event.timeValid;
  const statusName = competition.status?.type?.name?.toUpperCase() ?? "";
  const statusDetail = `${competition.status?.type?.detail ?? ""} ${competition.status?.type?.shortDetail ?? ""}`;
  const timeTBD =
    !dateTBD &&
    (timeValid === false || statusName === "STATUS_TBD" || /\bTBD\b|\bTBA\b/.test(statusDetail));

  const seasonTypeRaw = event.seasonType ?? {};
  const typeId =
    seasonTypeRaw.id ?? (seasonTypeRaw.type !== undefined ? String(seasonTypeRaw.type) : undefined);
  const note = competition.notes?.map((n) => n.headline?.trim()).find(Boolean);
  const doubleheader = note?.match(/^doubleheader\s*[-–—]\s*game\s*(\d+)/i);

  return {
    id: event.id,
    league: league.key,
    seasonId: event.season?.year ?? context.seasonYear,
    seasonDisplayName:
      shortSeasonLabel(event.season?.displayName, event.season?.abbreviation, [league.name, league.label]) ??
      event.season?.displayName ?? context.seasonDisplayName,
    startDate: startDate ?? "",
    localDate: startDate ? dateInZone(startDate, league.scheduleTimeZone) : undefined,
    dateTBD,
    timeTBD,
    seasonType: {
      id: typeId,
      name: seasonTypeRaw.name ?? "Season",
      normalized: normalizeSeasonType({ ...seasonTypeRaw, id: typeId }, league),
    },
    week:
      league.hasWeeks && event.week && (event.week.number !== undefined || event.week.text)
        ? { number: event.week.number, label: event.week.text }
        : undefined,
    homeTeam: normalizeGameTeam(home, league),
    awayTeam: normalizeGameTeam(away, league),
    selectedTeamHomeAway: selected,
    neutralSite: Boolean(competition.neutralSite),
    venue: normalizeVenue(competition.venue),
    broadcasts: normalizeBroadcasts(competition.broadcasts),
    note: note || undefined,
    doubleheader: doubleheader
      ? { game: Number(doubleheader[1]) }
      : undefined,
    status: normalizeStatus(event, note),
    espnUrl: findEspnUrl(event),
  };
}
