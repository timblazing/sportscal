import { z } from "zod";

import { LEAGUE_KEYS, LEAGUES, type LeagueKey } from "@/lib/config/leagues";

export const LIMITS = {
  calendarName: 120,
  title: 200,
  description: 2000,
  location: 300,
  overrides: 250,
  overrideTitle: 200,
  overrideDescription: 2000,
  overrideLocation: 300,
  minDuration: 15,
  maxDuration: 24 * 60,
  teamSlug: 100,
} as const;

export const DEFAULT_TEMPLATES = {
  calendarName: "{team} {season} Schedule",
  title: "{team} {homeAwaySymbol} {opponent}",
  description: "",
  location: "{venue}",
} as const;

export function defaultTemplates(league: LeagueKey) {
  return {
    ...DEFAULT_TEMPLATES,
    ...LEAGUES[league].defaultTemplates,
    title: LEAGUES[league].titleTemplate ?? LEAGUES[league].defaultTemplates?.title ?? DEFAULT_TEMPLATES.title,
  };
}

export type TemplateField = keyof typeof DEFAULT_TEMPLATES;

const durationSchema = z.number().int().min(LIMITS.minDuration).max(LIMITS.maxDuration);

export const gameOverrideSchema = z
  .object({
    title: z.string().max(LIMITS.overrideTitle).optional(),
    description: z.string().max(LIMITS.overrideDescription).optional(),
    location: z.string().max(LIMITS.overrideLocation).optional(),
    durationMinutes: durationSchema.optional(),
    excluded: z.boolean().optional(),
  })
  .strict();
export type GameOverride = z.infer<typeof gameOverrideSchema>;

const eventIdSchema = z.string().regex(/^[0-9a-z-]{1,40}$/i, "Invalid event id");

export const overridesSchema = z
  .record(eventIdSchema, gameOverrideSchema)
  .refine((o) => Object.keys(o).length <= LIMITS.overrides, {
    message: `At most ${LIMITS.overrides} game overrides are allowed`,
  });

export const calendarConfigSchema = z
  .object({
    league: z.enum(LEAGUE_KEYS),
    teamId: z.string().regex(/^[0-9]{1,10}$/, "Invalid team id"),
    teamSlug: z.string().regex(/^[a-z0-9-]{1,100}$/, "Invalid team slug"),
    seasonMode: z.enum(["auto", "manual"]),
    seasonOverride: z.number().int().min(1900).max(2200).optional(),
    include: z
      .object({
        preseason: z.boolean(),
        regularSeason: z.boolean(),
        postseason: z.boolean(),
      })
      .strict(),
    templates: z
      .object({
        calendarName: z.string().max(LIMITS.calendarName),
        title: z.string().max(LIMITS.title),
        description: z.string().max(LIMITS.description),
        location: z.string().max(LIMITS.location),
      })
      .strict(),
    durationMinutes: durationSchema,
    busyStatus: z.enum(["free", "busy"]),
    includeEspnUrl: z.boolean(),
    overrides: overridesSchema,
  })
  .strict()
  .refine((c) => c.seasonMode === "auto" || c.seasonOverride !== undefined, {
    message: "A manual season requires seasonOverride",
    path: ["seasonOverride"],
  });

export type CalendarConfig = z.infer<typeof calendarConfigSchema>;

export function defaultConfig(
  league: LeagueKey,
  team: { id: string; slug: string },
): CalendarConfig {
  return {
    league,
    teamId: team.id,
    teamSlug: team.slug,
    seasonMode: "auto",
    include: { preseason: true, regularSeason: true, postseason: true },
    templates: defaultTemplates(league),
    durationMinutes: LEAGUES[league].defaultDurationMinutes,
    busyStatus: "free",
    includeEspnUrl: false,
    overrides: {},
  };
}

/** True when a config differs from the canonical feed's defaults. */
export function isDefaultConfig(config: CalendarConfig): boolean {
  const d = defaultConfig(config.league, { id: config.teamId, slug: config.teamSlug });
  return JSON.stringify(normalizeForCompare(config)) === JSON.stringify(normalizeForCompare(d));
}

function normalizeForCompare(c: CalendarConfig) {
  return {
    ...c,
    seasonOverride: c.seasonMode === "manual" ? c.seasonOverride : undefined,
    overrides: Object.fromEntries(
      Object.entries(c.overrides).filter(([, o]) => Object.keys(o).length > 0),
    ),
  };
}

/** Drop empty override entries and undefined keys. */
export function compactOverrides(overrides: Record<string, GameOverride>): Record<string, GameOverride> {
  const out: Record<string, GameOverride> = {};
  for (const [id, o] of Object.entries(overrides)) {
    const cleaned = Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== undefined),
    ) as GameOverride;
    if (cleaned.excluded === false) delete cleaned.excluded;
    if (Object.keys(cleaned).length) out[id] = cleaned;
  }
  return out;
}
