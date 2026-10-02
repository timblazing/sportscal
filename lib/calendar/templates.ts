/**
 * A tiny deterministic template engine: `{variable}` substitution only.
 * No expressions, no eval — templates are plain strings.
 */
import { LEAGUES } from "@/lib/config/leagues";
import type { GameTeam, SportsCalGame, SportsCalTeam } from "@/lib/types";

export interface TemplateVariable {
  name: string;
  description: string;
  /** Show in the compact picker by default. */
  common?: boolean;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { name: "team", description: "Your team's common name (Oklahoma, Steelers)", common: true },
  { name: "teamFull", description: "Your team's full name (Oklahoma Sooners)" },
  { name: "teamShort", description: "Your team's school or city (Pittsburgh)" },
  { name: "teamAbbr", description: "Your team's abbreviation (OU)" },
  { name: "opponent", description: "Opponent's common name", common: true },
  { name: "opponentFull", description: "Opponent's full name" },
  { name: "opponentShort", description: "Opponent's school or city" },
  { name: "opponentAbbr", description: "Opponent's abbreviation" },
  { name: "homeTeam", description: "Home team's common name" },
  { name: "awayTeam", description: "Away team's common name" },
  { name: "homeAbbr", description: "Home team abbreviation" },
  { name: "awayAbbr", description: "Away team abbreviation" },
  { name: "homeAway", description: "Home, Away, or Neutral" },
  { name: "homeAwaySymbol", description: "vs for home/neutral games, @ for away games", common: true },
  { name: "league", description: "League (NFL, NBA, NHL, NCAAF)" },
  { name: "season", description: "Season label from ESPN (2026, 2026-27)", common: true },
  { name: "seasonType", description: "Preseason, Regular Season, Postseason", common: true },
  { name: "week", description: "Week label when ESPN provides one (Week 6)", common: true },
  { name: "note", description: "ESPN game note (bowl name, playoff round)", common: true },
  { name: "venue", description: "Venue name", common: true },
  { name: "venueFull", description: "Venue with city and state" },
  { name: "city", description: "Venue city" },
  { name: "state", description: "Venue state" },
  { name: "broadcast", description: "TV / streaming networks", common: true },
  { name: "date", description: "Game date (Eastern Time)" },
  { name: "time", description: "Start time (Eastern Time) or TBD" },
  { name: "status", description: "Scheduled, Final, Postponed, Canceled" },
  { name: "result", description: "Final result for your team (W 24-17)" },
];

const KNOWN = new Set(TEMPLATE_VARIABLES.map((v) => v.name));
const TOKEN_RE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

export type TemplateValues = Record<string, string | undefined>;

/** Names in a template that aren't supported variables. */
export function unknownVariables(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(TOKEN_RE)) {
    if (!KNOWN.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

const EDGE_SEPARATORS = /^[\s\-–—|·•,:/]+|[\s\-–—|·•,:/]+$/g;

function cleanLine(line: string): string {
  return line
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/([-–—|·•])(\s*[-–—|·•])+/g, "$1")
    .replace(EDGE_SEPARATORS, "")
    .trim();
}

/**
 * Replace `{variable}` tokens. Missing or unknown values render as empty
 * strings, then leftover double spaces, empty brackets and dangling
 * separators are cleaned up line by line.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  const replaced = template.replace(TOKEN_RE, (_, name: string) => {
    // Only own properties of known variables — never inherited ones like {constructor}.
    if (!KNOWN.has(name) || !Object.hasOwn(values, name)) return "";
    const value = values[name];
    return value === undefined || value === null ? "" : String(value);
  });
  return replaced
    .split(/\r?\n/)
    .map(cleanLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Values from the normalized game model
// ---------------------------------------------------------------------------

const DISPLAY_TZ = "America/New_York";

function formatDate(game: SportsCalGame): string {
  if (game.dateTBD) return "TBD";
  const d = new Date(game.startDate);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatTime(game: SportsCalGame): string {
  if (game.dateTBD || game.timeTBD) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(game.startDate));
}

function statusLabel(game: SportsCalGame): string {
  if (game.status.cancelled) return "Canceled";
  if (game.status.postponed) return "Postponed";
  if (game.status.completed) return "Final";
  if (game.status.state === "in") return "In Progress";
  return "Scheduled";
}

function resultLabel(team: GameTeam, opponent: GameTeam, game: SportsCalGame): string | undefined {
  if (!game.status.completed || !team.score || !opponent.score) return undefined;
  const outcome = team.winner ? "W" : opponent.winner ? "L" : "T";
  // ESPN marks overtime/shootout finals in the status detail ("Final/OT", "Final/2OT", "Final/SO").
  const extra = game.status.detail?.match(/^Final\/(\d*OT|SO)$/i)?.[1].toUpperCase();
  return `${outcome} ${team.score}-${opponent.score}${extra ? ` (${extra})` : ""}`;
}

function seasonTypeLabel(game: SportsCalGame): string {
  switch (game.seasonType.normalized) {
    case "preseason":
      return "Preseason";
    case "regular":
      return "Regular Season";
    case "postseason":
      return game.seasonType.name && /play-in/i.test(game.seasonType.name)
        ? game.seasonType.name
        : "Postseason";
    default:
      return game.seasonType.name;
  }
}

export function gameTemplateValues(game: SportsCalGame): TemplateValues {
  const isHome = game.selectedTeamHomeAway === "home";
  const team = isHome ? game.homeTeam : game.awayTeam;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const venue = game.venue;
  const venueFull = [venue?.name, venue?.city, venue?.state].filter(Boolean).join(", ");

  return {
    team: team.shortName,
    teamFull: team.displayName,
    teamShort: team.location,
    teamAbbr: team.abbreviation,
    opponent: opponent.shortName,
    opponentFull: opponent.displayName,
    opponentShort: opponent.location,
    opponentAbbr: opponent.abbreviation,
    homeTeam: game.homeTeam.shortName,
    awayTeam: game.awayTeam.shortName,
    homeAbbr: game.homeTeam.abbreviation,
    awayAbbr: game.awayTeam.abbreviation,
    homeAway: game.neutralSite ? "Neutral" : isHome ? "Home" : "Away",
    // Neutral-site games read naturally as "vs" regardless of ESPN's designation.
    homeAwaySymbol: game.neutralSite || isHome ? "vs" : "@",
    league: LEAGUES[game.league].label,
    season: game.seasonDisplayName,
    seasonType: seasonTypeLabel(game),
    week: game.week?.label ?? (game.week?.number !== undefined ? `Week ${game.week.number}` : undefined),
    note: game.note,
    venue: venue?.name,
    venueFull,
    city: venue?.city,
    state: venue?.state,
    broadcast: game.broadcasts.join(", "),
    date: formatDate(game),
    time: formatTime(game),
    status: statusLabel(game),
    result: resultLabel(team, opponent, game),
  };
}

/** Values for the calendar-name template, which isn't tied to one game. */
export function calendarTemplateValues(
  team: Pick<SportsCalTeam, "shortName" | "displayName" | "location" | "abbreviation" | "league">,
  seasonDisplayName: string,
): TemplateValues {
  return {
    team: team.shortName,
    teamFull: team.displayName,
    teamShort: team.location,
    teamAbbr: team.abbreviation,
    league: LEAGUES[team.league].label,
    season: seasonDisplayName,
  };
}
