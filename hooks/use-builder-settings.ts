"use client";

import { useCallback, useState } from "react";

import type { BuilderSettings } from "@/lib/client/storage";
import { LEAGUES, type LeagueKey } from "@/lib/config/leagues";
import { DEFAULT_TEMPLATES, type GameOverride } from "@/lib/validation/calendar-config";

export function defaultSettings(league: LeagueKey): BuilderSettings {
  return {
    seasonMode: "auto",
    include: { preseason: false, regularSeason: true, postseason: true },
    templates: { ...DEFAULT_TEMPLATES },
    durationMinutes: LEAGUES[league].defaultDurationMinutes,
    busyStatus: "free",
    includeEspnUrl: false,
    overrides: {},
  };
}

/** Merge possibly-stale stored settings over defaults, ignoring malformed values. */
export function mergeSettings(league: LeagueKey, stored?: Partial<BuilderSettings>): BuilderSettings {
  const base = defaultSettings(league);
  if (!stored || typeof stored !== "object") return base;
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    ...base,
    include: {
      preseason: bool(stored.include?.preseason, base.include.preseason),
      regularSeason: bool(stored.include?.regularSeason, base.include.regularSeason),
      postseason: bool(stored.include?.postseason, base.include.postseason),
    },
    templates: {
      calendarName: str(stored.templates?.calendarName, base.templates.calendarName),
      title: str(stored.templates?.title, base.templates.title),
      description: str(stored.templates?.description, base.templates.description),
      location: str(stored.templates?.location, base.templates.location),
    },
    busyStatus: stored.busyStatus === "busy" ? "busy" : "free",
    includeEspnUrl: bool(stored.includeEspnUrl, false),
  };
}

export function useBuilderSettings(league: LeagueKey, initial?: BuilderSettings) {
  const [settings, setSettings] = useState<BuilderSettings>(() => initial ?? defaultSettings(league));

  const update = useCallback((patch: Partial<BuilderSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const setOverride = useCallback((gameId: string, override: GameOverride | undefined) => {
    setSettings((s) => {
      const overrides = { ...s.overrides };
      if (override) overrides[gameId] = override;
      else delete overrides[gameId];
      return { ...s, overrides };
    });
  }, []);

  /** Team or league changed: per-game data no longer applies. */
  const resetForTeam = useCallback((nextLeague: LeagueKey, leagueChanged: boolean) => {
    setSettings((s) => ({
      ...s,
      seasonMode: "auto",
      seasonOverride: undefined,
      overrides: {},
      durationMinutes: leagueChanged ? LEAGUES[nextLeague].defaultDurationMinutes : s.durationMinutes,
    }));
  }, []);

  return { settings, setSettings, update, setOverride, resetForTeam };
}
