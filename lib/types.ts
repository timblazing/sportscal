/**
 * SportsCal's normalized domain model. Nothing outside `lib/espn` should
 * depend on ESPN's raw JSON — only on these shapes.
 */
import type { LeagueKey, NormalizedSeasonType } from "@/lib/config/leagues";

export type { LeagueKey, NormalizedSeasonType };

export interface SportsCalTeam {
  id: string;
  slug: string;
  /** Mascot / nickname, e.g. "Sooners", "Steelers". */
  name: string;
  /** Common short name, e.g. "Oklahoma", "Steelers", "Thunder". */
  shortName: string;
  /** Full name, e.g. "Oklahoma Sooners". */
  displayName: string;
  /** School or city, e.g. "Oklahoma", "Pittsburgh". */
  location: string;
  abbreviation: string;
  logo?: string;
  color?: string;
  league: LeagueKey;
  conference?: {
    id?: string;
    name: string;
    shortName?: string;
  };
  division?: {
    id?: string;
    name: string;
  };
  isFbs?: boolean;
}

/** Minimal team reference as it appears inside a game. */
export type GameTeam = Pick<
  SportsCalTeam,
  "id" | "name" | "shortName" | "displayName" | "location" | "abbreviation" | "logo"
> & {
  score?: string;
  winner?: boolean;
};

export type GameState = "pre" | "in" | "post";

export interface SportsCalGame {
  id: string;
  league: LeagueKey;
  seasonId: number;
  seasonDisplayName: string;

  /** ISO-8601 UTC timestamp. Empty when the date is truly unknown. */
  startDate: string;
  /** Calendar date (YYYY-MM-DD) used for all-day events when the time is TBD. */
  localDate?: string;

  dateTBD: boolean;
  timeTBD: boolean;

  seasonType: {
    id?: string;
    name: string;
    normalized: NormalizedSeasonType;
  };

  week?: {
    number?: number;
    label?: string;
  };

  homeTeam: GameTeam;
  awayTeam: GameTeam;

  selectedTeamHomeAway: "home" | "away";
  neutralSite: boolean;

  venue?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  broadcasts: string[];
  doubleheader?: { game: number };

  /** ESPN headline note, e.g. "West Finals - Game 7" or a bowl name. */
  note?: string;

  status: {
    state: GameState;
    completed: boolean;
    cancelled?: boolean;
    postponed?: boolean;
    tentative?: boolean;
    detail?: string;
  };

  espnUrl?: string;
}

export type SeasonStatus = "upcoming" | "active" | "completed";

export interface ResolvedSeason {
  espnSeason: number;
  displayName: string;
  status: SeasonStatus;
  /**
   * When the resolver fell back to a completed season because ESPN has not
   * published the next one yet, this describes the pending season.
   */
  pendingNextSeason?: {
    espnSeason: number;
    displayName?: string;
  };
}

export interface SeasonOption {
  espnSeason: number;
  displayName: string;
}

export interface TeamSchedule {
  team: SportsCalTeam;
  season: ResolvedSeason;
  games: SportsCalGame[];
  /** ISO timestamp the schedule was assembled. */
  fetchedAt: string;
}
