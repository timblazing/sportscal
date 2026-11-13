"use client";

import { useCallback, useState } from "react";

import type { BuilderSettings } from "@/lib/client/storage";
import { isLeagueKey, LEAGUES, type LeagueKey } from "@/lib/config/leagues";
import { defaultTemplates, type GameOverride } from "@/lib/validation/calendar-config";

export function defaultSettings(league: LeagueKey): BuilderSettings {
  return {
    seasonMode: "auto",
    include: { preseason: true, regularSeason: true, postseason: true },
    templates: defaultTemplates(league),
    durationMinutes: LEAGUES[league].defaultDurationMinutes,
    busyStatus: "free",
    includeEspnUrl: false,
    overrides: {},
  };
}

/**
 * Merge possibly-stale stored settings over defaults, ignoring malformed values.
 * `storedLeague` is the league the settings were saved under: templates still at
 * that league's defaults are translated to `league`'s defaults, customized ones
 * are kept. Without a valid stored league there is nothing to compare against,
 * so templates fall back to `league`'s defaults.
 */
export function mergeSettings(
  league: LeagueKey,
  stored?: Partial<BuilderSettings>,
  storedLeague?: unknown,
): BuilderSettings {
  const base = defaultSettings(league);
  if (!stored || typeof stored !== "object") return base;
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const previousLeague = isLeagueKey(storedLeague) ? storedLeague : undefined;
  const previous = defaultSettings(previousLeague ?? league).templates;
  const storedTemplates = {
    calendarName: str(stored.templates?.calendarName, previous.calendarName),
    title: str(stored.templates?.title, previous.title),
    description: str(stored.templates?.description, previous.description),
    location: str(stored.templates?.location, previous.location),
  };
  return {
    ...base,
    include: {
      preseason: bool(stored.include?.preseason, base.include.preseason),
      regularSeason: bool(stored.include?.regularSeason, base.include.regularSeason),
      postseason: bool(stored.include?.postseason, base.include.postseason),
    },
    templates: previousLeague ? templatesForLeagueChange(storedTemplates, previousLeague, league) : base.templates,
    busyStatus: stored.busyStatus === "busy" ? "busy" : "free",
    includeEspnUrl: bool(stored.includeEspnUrl, false),
  };
}

/** Carry edited templates across leagues, updating only fields still at their defaults. */
export function templatesForLeagueChange(
  templates: BuilderSettings["templates"],
  previousLeague: LeagueKey,
  nextLeague: LeagueKey,
): BuilderSettings["templates"] {
  const previous = defaultSettings(previousLeague).templates;
  const next = defaultSettings(nextLeague).templates;
  return Object.fromEntries(
    Object.entries(templates).map(([field, value]) => {
      const key = field as keyof BuilderSettings["templates"];
      return [field, value === previous[key] ? next[key] : value];
    }),
  ) as BuilderSettings["templates"];
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
      templates: leagueChanged ? templatesForLeagueChange(s.templates, league, nextLeague) : s.templates,
    }));
  }, [league]);

  return { settings, setSettings, update, setOverride, resetForTeam };
}
