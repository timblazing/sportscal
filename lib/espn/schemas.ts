/**
 * Defensive Zod schemas for the parts of ESPN's undocumented responses that
 * SportsCal relies on. Objects are loose (unknown keys pass through) and
 * noncritical fields are optional so small upstream changes don't break feeds.
 */
import { z } from "zod";

const idLike = z.union([z.string(), z.number()]).transform(String);

export const espnLogoSchema = z.looseObject({
  href: z.string(),
  rel: z.array(z.string()).optional(),
});

export const espnTeamSchema = z.looseObject({
  id: idLike,
  slug: z.string().optional(),
  location: z.string().optional(),
  name: z.string().optional(),
  nickname: z.string().optional(),
  abbreviation: z.string().optional(),
  displayName: z.string().optional(),
  shortDisplayName: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  logos: z.array(espnLogoSchema).optional(),
  logo: z.string().optional(),
});
export type EspnTeam = z.infer<typeof espnTeamSchema>;

/** GET site/.../teams */
export const espnTeamsResponseSchema = z.looseObject({
  sports: z.array(
    z.looseObject({
      leagues: z.array(
        z.looseObject({
          teams: z.array(z.looseObject({ team: espnTeamSchema })).default([]),
        }),
      ),
    }),
  ),
});

/** GET site/.../groups — conference → division → teams (NFL/NBA/NHL). */
type EspnGroupNode = {
  name?: string;
  abbreviation?: string;
  id?: string;
  teams?: { id: string }[];
  children?: EspnGroupNode[];
};
export const espnGroupNodeSchema: z.ZodType<EspnGroupNode> = z.lazy(() =>
  z.looseObject({
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    id: idLike.optional(),
    teams: z.array(z.looseObject({ id: idLike })).optional(),
    children: z.array(espnGroupNodeSchema).optional(),
  }),
);
export type { EspnGroupNode };
export const espnGroupsResponseSchema = z.looseObject({
  groups: z.array(espnGroupNodeSchema).default([]),
});

/** GET apis/v2/.../standings?group=N — conferences containing standings entries. */
type EspnStandingsNode = {
  id?: string;
  name?: string;
  abbreviation?: string;
  shortName?: string;
  isConference?: boolean;
  standings?: { entries?: { team: EspnTeam }[] };
  children?: EspnStandingsNode[];
};
export const espnStandingsNodeSchema: z.ZodType<EspnStandingsNode> = z.lazy(() =>
  z.looseObject({
    id: idLike.optional(),
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    shortName: z.string().optional(),
    isConference: z.boolean().optional(),
    standings: z
      .looseObject({
        entries: z.array(z.looseObject({ team: espnTeamSchema })).optional(),
      })
      .optional(),
    children: z.array(espnStandingsNodeSchema).optional(),
  }),
);
export type { EspnStandingsNode };

/** Core API season: GET core/.../season and core/.../seasons/{year}. */
export const espnSeasonTypeSchema = z.looseObject({
  id: idLike,
  type: z.number().optional(),
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type EspnSeasonType = z.infer<typeof espnSeasonTypeSchema>;

export const espnSeasonSchema = z.looseObject({
  year: z.number(),
  displayName: z.string().optional(),
  abbreviation: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  types: z
    .looseObject({
      items: z.array(espnSeasonTypeSchema).default([]),
    })
    .optional(),
});
export type EspnSeason = z.infer<typeof espnSeasonSchema>;

/** Core API paged ref list (used for event counts). */
export const espnPagedCountSchema = z.looseObject({
  count: z.number().default(0),
});

/** Team schedule event (site API). */
export const espnCompetitorSchema = z.looseObject({
  id: idLike.optional(),
  homeAway: z.string().optional(),
  winner: z.boolean().optional(),
  score: z
    .union([
      z.looseObject({ displayValue: z.string().optional(), value: z.number().optional() }),
      z.string(),
    ])
    .optional(),
  team: espnTeamSchema,
});
export type EspnCompetitor = z.infer<typeof espnCompetitorSchema>;

export const espnVenueSchema = z.looseObject({
  fullName: z.string().optional(),
  address: z
    .looseObject({
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});
export type EspnVenue = z.infer<typeof espnVenueSchema>;

export const espnBroadcastSchema = z.looseObject({
  media: z.looseObject({ shortName: z.string().optional() }).optional(),
  names: z.array(z.string()).optional(),
  type: z.looseObject({ shortName: z.string().optional() }).optional(),
});
export type EspnBroadcast = z.infer<typeof espnBroadcastSchema>;

export const espnStatusSchema = z.looseObject({
  type: z
    .looseObject({
      name: z.string().optional(),
      state: z.string().optional(),
      completed: z.boolean().optional(),
      description: z.string().optional(),
      detail: z.string().optional(),
      shortDetail: z.string().optional(),
    })
    .optional(),
});

export const espnCompetitionSchema = z.looseObject({
  id: idLike.optional(),
  date: z.string().optional(),
  timeValid: z.boolean().optional(),
  neutralSite: z.boolean().optional(),
  venue: espnVenueSchema.optional(),
  competitors: z.array(espnCompetitorSchema).default([]),
  broadcasts: z.array(espnBroadcastSchema).optional(),
  notes: z.array(z.looseObject({ headline: z.string().optional() })).optional(),
  status: espnStatusSchema.optional(),
});
export type EspnCompetition = z.infer<typeof espnCompetitionSchema>;

export const espnEventSchema = z.looseObject({
  id: idLike,
  date: z.string().optional(),
  name: z.string().optional(),
  timeValid: z.boolean().optional(),
  season: z
    .looseObject({ year: z.number().optional(), displayName: z.string().optional(), abbreviation: z.string().optional() })
    .optional(),
  seasonType: z
    .looseObject({
      id: idLike.optional(),
      type: z.number().optional(),
      name: z.string().optional(),
      abbreviation: z.string().optional(),
    })
    .optional(),
  week: z.looseObject({ number: z.number().optional(), text: z.string().optional() }).optional(),
  links: z
    .array(z.looseObject({ href: z.string().optional(), rel: z.array(z.string()).optional() }))
    .optional(),
  competitions: z.array(espnCompetitionSchema).default([]),
});
export type EspnEvent = z.infer<typeof espnEventSchema>;

/** GET site/.../teams/{id}/schedule — events are validated individually. */
export const espnScheduleResponseSchema = z.looseObject({
  team: espnTeamSchema.optional(),
  season: z
    .looseObject({ year: z.number().optional(), displayName: z.string().optional() })
    .optional(),
  requestedSeason: z
    .looseObject({
      year: z.number().optional(),
      type: z.number().optional(),
      displayName: z.string().optional(),
    })
    .nullish(),
  events: z.array(z.unknown()).default([]),
});
