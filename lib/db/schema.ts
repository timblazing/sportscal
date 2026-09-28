import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { GameOverride } from "@/lib/validation/calendar-config";

/** Anonymous saved calendar configurations. Contains no personal data. */
export const calendarConfigs = pgTable(
  "calendar_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: varchar("public_id", { length: 32 }).notNull(),
    /** SHA-256 of the edit token; the token itself is never stored. */
    editTokenHash: varchar("edit_token_hash", { length: 64 }).notNull(),

    league: varchar("league", { length: 16 }).notNull(),
    teamId: varchar("team_id", { length: 16 }).notNull(),
    teamSlug: varchar("team_slug", { length: 100 }).notNull(),

    seasonMode: varchar("season_mode", { length: 8 }).notNull().default("auto"),
    seasonOverride: integer("season_override"),

    includePreseason: boolean("include_preseason").notNull().default(true),
    includeRegularSeason: boolean("include_regular_season").notNull().default(true),
    includePostseason: boolean("include_postseason").notNull().default(true),

    calendarNameTemplate: text("calendar_name_template").notNull(),
    titleTemplate: text("title_template").notNull(),
    descriptionTemplate: text("description_template").notNull().default(""),
    locationTemplate: text("location_template").notNull(),

    durationMinutes: integer("duration_minutes").notNull(),
    busyStatus: varchar("busy_status", { length: 8 }).notNull().default("free"),
    includeEspnUrl: boolean("include_espn_url").notNull().default(false),

    overridesJson: jsonb("overrides_json")
      .$type<Record<string, GameOverride>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("calendar_configs_public_id_idx").on(t.publicId),
    index("calendar_configs_team_slug_idx").on(t.teamSlug),
    index("calendar_configs_league_idx").on(t.league),
  ],
);

export type CalendarConfigRow = typeof calendarConfigs.$inferSelect;
export type NewCalendarConfigRow = typeof calendarConfigs.$inferInsert;

/** Fixed-window counters for anonymous write rate limiting (keys are hashed). */
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 128 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});
