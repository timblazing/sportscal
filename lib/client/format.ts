import type { EventTiming } from "@/lib/calendar/events";

/** Display helpers for the preview. Times render in the viewer's own time zone. */

function localDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function timingDate(timing: EventTiming): Date | undefined {
  if (timing.kind === "timed") return new Date(timing.start);
  if (timing.kind === "allDay") return localDate(timing.date);
  return undefined;
}

export function formatEventDate(timing: EventTiming, style: "short" | "long" = "short"): string {
  const date = timingDate(timing);
  if (!date) return "Date TBD";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(style === "long" ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatEventTime(timing: EventTiming): string {
  if (timing.kind === "timed") {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
      new Date(timing.start),
    );
  }
  if (timing.kind === "allDay") return "Time TBD";
  return "TBD";
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

export function viewerTimeZoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "local time";
  } catch {
    return "local time";
  }
}
