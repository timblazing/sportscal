import type { NormalizedSeasonType } from "@/lib/config/leagues";

/** Normalized season-type window from ESPN's core season calendar. */
export interface SeasonTypeMeta {
  id: string;
  name: string;
  normalized: NormalizedSeasonType;
  startDate?: string;
  endDate?: string;
}

/** Normalized season metadata from ESPN's core API. */
export interface SeasonMeta {
  year: number;
  displayName: string;
  startDate?: string;
  endDate?: string;
  types: SeasonTypeMeta[];
}

/** Inputs to the pure season decision function. */
export interface SeasonResolverInput {
  /** ESPN's currently reported season. */
  current: SeasonMeta;
  /** The following season if ESPN knows about it. */
  next?: SeasonMeta | null;
  /** Number of regular-season events ESPN lists for `next`. */
  nextEventCount?: number;
}
