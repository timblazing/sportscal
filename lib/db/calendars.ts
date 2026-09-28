import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { calendarConfigs, type CalendarConfigRow, type NewCalendarConfigRow } from "@/lib/db/schema";
import { generateEditToken, generatePublicId, hashToken, verifyToken } from "@/lib/security/tokens";
import {
  calendarConfigSchema,
  compactOverrides,
  type CalendarConfig,
} from "@/lib/validation/calendar-config";

export function rowToConfig(row: CalendarConfigRow): CalendarConfig {
  // Validate on the way out too — the database is not blindly trusted.
  return calendarConfigSchema.parse({
    league: row.league,
    teamId: row.teamId,
    teamSlug: row.teamSlug,
    seasonMode: row.seasonMode,
    seasonOverride: row.seasonOverride ?? undefined,
    include: {
      preseason: row.includePreseason,
      regularSeason: row.includeRegularSeason,
      postseason: row.includePostseason,
    },
    templates: {
      calendarName: row.calendarNameTemplate,
      title: row.titleTemplate,
      description: row.descriptionTemplate,
      location: row.locationTemplate,
    },
    durationMinutes: row.durationMinutes,
    busyStatus: row.busyStatus,
    includeEspnUrl: row.includeEspnUrl,
    overrides: row.overridesJson ?? {},
  });
}

function configToColumns(config: CalendarConfig) {
  return {
    league: config.league,
    teamId: config.teamId,
    teamSlug: config.teamSlug,
    seasonMode: config.seasonMode,
    seasonOverride: config.seasonMode === "manual" ? (config.seasonOverride ?? null) : null,
    includePreseason: config.include.preseason,
    includeRegularSeason: config.include.regularSeason,
    includePostseason: config.include.postseason,
    calendarNameTemplate: config.templates.calendarName,
    titleTemplate: config.templates.title,
    descriptionTemplate: config.templates.description,
    locationTemplate: config.templates.location,
    durationMinutes: config.durationMinutes,
    busyStatus: config.busyStatus,
    includeEspnUrl: config.includeEspnUrl,
    overridesJson: compactOverrides(config.overrides),
  } satisfies Omit<NewCalendarConfigRow, "publicId" | "editTokenHash">;
}

export async function createCalendar(
  config: CalendarConfig,
): Promise<{ publicId: string; editToken: string }> {
  const db = getDb();
  const editToken = generateEditToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const publicId = generatePublicId();
    const inserted = await db
      .insert(calendarConfigs)
      .values({ ...configToColumns(config), publicId, editTokenHash: hashToken(editToken) })
      .onConflictDoNothing({ target: calendarConfigs.publicId })
      .returning({ publicId: calendarConfigs.publicId });
    if (inserted.length) return { publicId, editToken };
  }
  throw new Error("Could not allocate a calendar id");
}

export async function getCalendarRow(publicId: string): Promise<CalendarConfigRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(calendarConfigs)
    .where(eq(calendarConfigs.publicId, publicId))
    .limit(1);
  return row;
}

/** Record feed access at most roughly hourly to avoid a write per request. */
export async function touchCalendar(row: CalendarConfigRow): Promise<void> {
  const last = row.lastAccessedAt?.getTime() ?? 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  await getDb()
    .update(calendarConfigs)
    .set({ lastAccessedAt: sql`now()` })
    .where(eq(calendarConfigs.id, row.id));
}

export type AuthorizedResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "unauthorized" };

/** Check an edit token without modifying anything. */
export async function authorizeCalendar(
  publicId: string,
  editToken: string,
): Promise<AuthorizedResult<CalendarConfigRow>> {
  const row = await getCalendarRow(publicId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!verifyToken(editToken, row.editTokenHash)) return { ok: false, reason: "unauthorized" };
  return { ok: true, value: row };
}

export async function updateCalendar(
  publicId: string,
  editToken: string,
  config: CalendarConfig,
): Promise<AuthorizedResult<CalendarConfig>> {
  const row = await getCalendarRow(publicId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!verifyToken(editToken, row.editTokenHash)) return { ok: false, reason: "unauthorized" };
  const [updated] = await getDb()
    .update(calendarConfigs)
    .set({ ...configToColumns(config), updatedAt: sql`now()` })
    .where(eq(calendarConfigs.id, row.id))
    .returning();
  return { ok: true, value: rowToConfig(updated) };
}

export async function deleteCalendar(
  publicId: string,
  editToken: string,
): Promise<AuthorizedResult<null>> {
  const row = await getCalendarRow(publicId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!verifyToken(editToken, row.editTokenHash)) return { ok: false, reason: "unauthorized" };
  await getDb().delete(calendarConfigs).where(eq(calendarConfigs.id, row.id));
  return { ok: true, value: null };
}
