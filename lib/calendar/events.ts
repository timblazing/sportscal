/**
 * Turns normalized games + a calendar configuration into calendar events.
 * Shared by the live preview (client) and the .ics generator (server), so the
 * preview always matches the file.
 */
import type { SportsCalGame } from "@/lib/types";
import type { CalendarConfig } from "@/lib/validation/calendar-config";
import { isSeasonTypeIncluded } from "@/lib/calendar/filters";
import { applyOverride } from "@/lib/calendar/overrides";
import { gameTemplateValues, renderTemplate } from "@/lib/calendar/templates";
import { eventUid } from "@/lib/calendar/uid";

export type EventTiming =
  | { kind: "timed"; start: string; durationMinutes: number }
  | { kind: "allDay"; date: string }
  | { kind: "unscheduled" };

export type EventStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

export interface CalendarEvent {
  uid: string;
  gameId: string;
  title: string;
  description: string;
  location: string;
  timing: EventTiming;
  status: EventStatus;
  url?: string;
  busy: boolean;
  durationMinutes: number;
  /** Excluded by season type filter or a per-game override. */
  included: boolean;
  excludedBy?: "seasonType" | "override" | "unscheduled";
  overridden: boolean;
  game: SportsCalGame;
}

export function eventTiming(game: SportsCalGame, durationMinutes: number): EventTiming {
  if (game.dateTBD || !game.startDate) return { kind: "unscheduled" };
  // TBD start times (and postponements without a new time) become all-day
  // events on ESPN's listed date; the same UID later turns into a timed event.
  if (game.timeTBD || game.status.postponed) {
    return game.localDate ? { kind: "allDay", date: game.localDate } : { kind: "unscheduled" };
  }
  return { kind: "timed", start: game.startDate, durationMinutes };
}

export function eventStatus(game: SportsCalGame): EventStatus {
  if (game.status.cancelled) return "CANCELLED";
  if (game.status.postponed) return "TENTATIVE";
  return "CONFIRMED";
}

export function buildCalendarEvents(
  games: SportsCalGame[],
  config: Pick<
    CalendarConfig,
    "include" | "templates" | "durationMinutes" | "busyStatus" | "includeEspnUrl" | "overrides"
  >,
  uidScope: string,
): CalendarEvent[] {
  return games.map((game) => {
    const values = gameTemplateValues(game);
    const fields = applyOverride(
      {
        title: renderTemplate(config.templates.title, values),
        description: renderTemplate(config.templates.description, values),
        location: renderTemplate(config.templates.location, values),
        durationMinutes: config.durationMinutes,
        excluded: false,
      },
      config.overrides[game.id],
    );
    const timing = eventTiming(game, fields.durationMinutes);
    const typeIncluded = isSeasonTypeIncluded(game, config.include);
    const excludedBy = !typeIncluded
      ? "seasonType"
      : fields.excluded
        ? "override"
        : timing.kind === "unscheduled"
          ? "unscheduled"
          : undefined;

    return {
      uid: eventUid(game.id, uidScope),
      gameId: game.id,
      title: fields.title || `${values.team} ${values.homeAwaySymbol} ${values.opponent}`,
      description: fields.description,
      location: fields.location,
      timing,
      status: eventStatus(game),
      url: config.includeEspnUrl ? game.espnUrl : undefined,
      busy: config.busyStatus === "busy",
      durationMinutes: fields.durationMinutes,
      included: excludedBy === undefined,
      excludedBy,
      overridden: fields.overridden,
      game,
    };
  });
}
