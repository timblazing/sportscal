import "server-only";

import { buildCalendarEvents } from "@/lib/calendar/events";
import { generateIcs } from "@/lib/calendar/generator";
import { calendarTemplateValues, renderTemplate } from "@/lib/calendar/templates";
import { loadTeamSchedule } from "@/lib/schedule-service";
import { slugify } from "@/lib/utils/slug";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

export interface Feed {
  ics: string;
  filename: string;
  calendarName: string;
  eventCount: number;
}

/**
 * The full feed pipeline: resolve season → fetch cached ESPN schedule →
 * filter → templates → overrides → ICS.
 */
export async function buildFeed(config: CalendarConfig, uidScope: string): Promise<Feed> {
  const { team, season, games } = await loadTeamSchedule(config.league, config.teamId, {
    seasonMode: config.seasonMode,
    seasonOverride: config.seasonOverride,
  });
  const calendarName =
    renderTemplate(config.templates.calendarName, calendarTemplateValues(team, season.displayName)) ||
    `${team.displayName} ${season.displayName}`;
  const events = buildCalendarEvents(games, config, uidScope);
  const ics = generateIcs(events, { calendarName });
  return {
    ics,
    calendarName,
    filename: `${team.slug}-${slugify(season.displayName)}.ics`,
    eventCount: events.filter((e) => e.included).length,
  };
}
