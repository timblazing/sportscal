/**
 * League registry. Everything league-specific lives here as configuration so
 * adding another league (NHL, MLB, WNBA, ...) is mostly a matter of adding an
 * entry. ESPN URLs are always assembled from these known values — never from
 * user input.
 */

export const LEAGUE_KEYS = ["nfl", "nba", "wnba", "nhl", "ncaaf", "ncaab", "mls", "epl"] as const;
export type LeagueKey = (typeof LEAGUE_KEYS)[number];

export type NormalizedSeasonType = "preseason" | "regular" | "postseason" | "other";

/** How the team picker obtains conference/division grouping. */
export type TeamGroupingSource =
  /** Site API `/groups` endpoint (conference → division → teams). */
  | { kind: "groups" }
  /** Site API standings for the listed group ids (conference → teams). */
  | { kind: "flat" }
  /** Root standings children are conferences, even without isConference. */
  | { kind: "conferenceStandings" }
  | {
      kind: "standings";
      /** Groups shown by default (e.g. FBS). */
      defaultGroupIds: string[];
      /** Additional groups exposed with "Show all teams" (e.g. FCS). */
      extendedGroupIds: string[];
    };

export interface LeagueConfig {
  key: LeagueKey;
  /** ESPN sport slug. */
  sport: string;
  /** ESPN league slug. */
  league: string;
  label: string;
  /** Longer human label. */
  name: string;
  defaultDurationMinutes: number;
  /**
   * ESPN season types (the `seasontype` query param) that the team schedule
   * endpoint must be queried for. ESPN only returns one season type per request.
   */
  scheduleSeasonTypes: number[];
  scheduleQueries?: Record<string, string | number | boolean>[];
  regularSeasonTypeId?: number;
  gameTypes?: ("preseason" | "regular" | "postseason")[];
  defaultTemplates?: Partial<Record<"calendarName" | "title" | "description" | "location", string>>;
  drawLabel?: string;
  postseasonLabel?: string;
  note?: string;
  /**
   * Fallback mapping of ESPN season type ids to normalized values. The adapter
   * prefers ESPN's own names/abbreviations and only falls back to this.
   */
  seasonTypeFallback: Record<string, NormalizedSeasonType>;
  teamGrouping: TeamGroupingSource;
  /**
   * ESPN publishes TBD start times as midnight in this zone (e.g. 05:00Z during
   * EST). Used only to recover the calendar date of an all-day TBD event.
   */
  scheduleTimeZone: string;
  /** Whether games are organised by week (football) — affects preview text. */
  hasWeeks: boolean;
}

const MLS_SCHEDULE_TYPES = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export const LEAGUES: Record<LeagueKey, LeagueConfig> = {
  nfl: {
    key: "nfl",
    sport: "football",
    league: "nfl",
    label: "NFL",
    name: "National Football League",
    defaultDurationMinutes: 210,
    scheduleSeasonTypes: [1, 2, 3],
    seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
    teamGrouping: { kind: "groups" },
    scheduleTimeZone: "America/New_York",
    hasWeeks: true,
  },
  nba: {
    key: "nba",
    sport: "basketball",
    league: "nba",
    label: "NBA",
    name: "National Basketball Association",
    defaultDurationMinutes: 150,
    // 5 = Play-In Season, which ESPN serves separately from the playoffs.
    scheduleSeasonTypes: [1, 2, 5, 3],
    seasonTypeFallback: {
      "1": "preseason",
      "2": "regular",
      "3": "postseason",
      "4": "other",
      "5": "postseason",
    },
    teamGrouping: { kind: "groups" },
    scheduleTimeZone: "America/New_York",
    hasWeeks: false,
  },
  wnba: {
    key: "wnba",
    sport: "basketball",
    league: "wnba",
    label: "WNBA",
    name: "Women's National Basketball Association",
    defaultDurationMinutes: 120,
    scheduleSeasonTypes: [1, 2, 3],
    seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
    // WNBA /groups has no team membership; standings group 3 lists both conferences.
    teamGrouping: { kind: "standings", defaultGroupIds: ["3"], extendedGroupIds: [] },
    scheduleTimeZone: "America/New_York",
    hasWeeks: false,
  },
  nhl: {
    key: "nhl",
    sport: "hockey",
    league: "nhl",
    label: "NHL",
    name: "National Hockey League",
    defaultDurationMinutes: 150,
    // No Play-In: ESPN's seasontype=5 is empty for the NHL.
    scheduleSeasonTypes: [1, 2, 3],
    seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
    teamGrouping: { kind: "groups" },
    scheduleTimeZone: "America/New_York",
    hasWeeks: false,
  },
  ncaaf: {
    key: "ncaaf",
    sport: "football",
    league: "college-football",
    label: "NCAAF",
    name: "NCAA Division I Football",
    defaultDurationMinutes: 210,
    scheduleSeasonTypes: [1, 2, 3],
    seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
    // ESPN group 80 = FBS, 81 = FCS (verified against live standings responses).
    teamGrouping: { kind: "standings", defaultGroupIds: ["80"], extendedGroupIds: ["81"] },
    scheduleTimeZone: "America/New_York",
    hasWeeks: true,
  },
  ncaab: {
    key: "ncaab",
    sport: "basketball",
    league: "mens-college-basketball",
    label: "NCAAB",
    name: "NCAA Division I Men's Basketball",
    defaultDurationMinutes: 120,
    // Conference tournaments and MTEs are regular season; NCAA/NIT games are postseason.
    scheduleSeasonTypes: [2, 3],
    seasonTypeFallback: { "1": "preseason", "2": "regular", "3": "postseason", "4": "other" },
    teamGrouping: { kind: "standings", defaultGroupIds: ["50"], extendedGroupIds: [] },
    scheduleTimeZone: "America/New_York",
    hasWeeks: false,
  },
  mls: {
    key: "mls",
    sport: "soccer",
    league: "usa.1",
    label: "MLS",
    name: "Major League Soccer",
    defaultDurationMinutes: 120,
    // All-Star (2) is excluded; every playoff series slot and MLS Cup is included.
    scheduleSeasonTypes: MLS_SCHEDULE_TYPES,
    scheduleQueries: MLS_SCHEDULE_TYPES.flatMap((seasontype): Record<string, string | number | boolean>[] => [
      { seasontype },
      { seasontype, fixture: true },
    ]),
    regularSeasonTypeId: 1,
    seasonTypeFallback: {
      "0": "other", "1": "regular", "2": "other",
      ...Object.fromEntries(MLS_SCHEDULE_TYPES.slice(1).map((id) => [String(id), "postseason" as const])),
    },
    gameTypes: ["regular", "postseason"],
    postseasonLabel: "Playoffs",
    teamGrouping: { kind: "conferenceStandings" },
    scheduleTimeZone: "America/New_York",
    hasWeeks: false,
    drawLabel: "D",
    defaultTemplates: { title: "{homeTeam} v {awayTeam}" },
    note: "MLS matches and playoffs only; Leagues Cup, U.S. Open Cup and CONCACAF Champions Cup are not included.",
  },
  epl: {
    key: "epl",
    sport: "soccer",
    league: "eng.1",
    label: "Premier League",
    name: "English Premier League",
    defaultDurationMinutes: 120,
    scheduleSeasonTypes: [1],
    scheduleQueries: [{ seasontype: 1 }, { seasontype: 1, fixture: true }],
    regularSeasonTypeId: 1,
    seasonTypeFallback: { "1": "regular" },
    gameTypes: ["regular"],
    teamGrouping: { kind: "flat" },
    scheduleTimeZone: "Europe/London",
    hasWeeks: false,
    drawLabel: "D",
    note: "Premier League matches only.",
    defaultTemplates: {
      title: "{homeTeam} v {awayTeam}",
      calendarName: "{team} Premier League {season}",
    },
  },
};

export const LEAGUE_LIST: LeagueConfig[] = LEAGUE_KEYS.map((k) => LEAGUES[k]);

export function isLeagueKey(value: unknown): value is LeagueKey {
  return typeof value === "string" && (LEAGUE_KEYS as readonly string[]).includes(value);
}

export function getLeague(key: LeagueKey): LeagueConfig {
  return LEAGUES[key];
}
