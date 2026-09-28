import { createEvents, type DateArray, type EventAttributes } from "ics";

import type { CalendarEvent } from "@/lib/calendar/events";

export const PRODUCT_ID = "-//sportscal.site//SportsCal//EN";

function dateArray(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function nextDay(date: string): DateArray {
  const [y, m, d] = dateArray(date);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
}

export function toIcsEvent(event: CalendarEvent, dtstamp: number): EventAttributes | null {
  const common = {
    uid: event.uid,
    title: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    status: event.status,
    url: event.url,
    busyStatus: event.busy ? ("BUSY" as const) : ("FREE" as const),
    transp: event.busy ? ("OPAQUE" as const) : ("TRANSPARENT" as const),
    productId: PRODUCT_ID,
    lastModified: dtstamp,
  };
  const { timing } = event;
  if (timing.kind === "timed") {
    const minutes = timing.durationMinutes;
    return {
      ...common,
      start: Date.parse(timing.start),
      startInputType: "utc",
      startOutputType: "utc",
      duration: { hours: Math.floor(minutes / 60), minutes: minutes % 60 },
    };
  }
  if (timing.kind === "allDay") {
    return { ...common, start: dateArray(timing.date), end: nextDay(timing.date) };
  }
  return null;
}

export interface GenerateOptions {
  calendarName: string;
  /** Fixed timestamp for DTSTAMP (tests); defaults to now. */
  now?: Date;
}

/** Build a VCALENDAR string from calendar events (excluded events are skipped). */
export function generateIcs(events: CalendarEvent[], options: GenerateOptions): string {
  const dtstamp = (options.now ?? new Date()).getTime();
  const attributes = events
    .filter((e) => e.included)
    .map((e) => toIcsEvent(e, dtstamp))
    .filter((e): e is EventAttributes => e !== null);

  const header = { productId: PRODUCT_ID, method: "PUBLISH", calName: options.calendarName };

  if (attributes.length === 0) {
    // `ics` can't serialize an empty calendar; emit a valid empty VCALENDAR so
    // subscriptions keep working until ESPN publishes games.
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      `PRODID:${PRODUCT_ID}`,
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(options.calendarName)}`,
      "X-PUBLISHED-TTL:PT1H",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
  }

  const { error, value } = createEvents(
    attributes.map((a) => ({ ...a, calName: undefined })),
    header,
  );
  if (error || !value) throw error ?? new Error("Failed to generate calendar");
  return value;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
