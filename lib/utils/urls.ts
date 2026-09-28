import type { LeagueKey } from "@/lib/config/leagues";

/**
 * Public origin (e.g. https://sportscal.site). Read from APP_URL at runtime so
 * a single Docker image works on any host.
 */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function canonicalFeedPath(league: LeagueKey, teamSlug: string): string {
  return `/calendar/${league}/${teamSlug}.ics`;
}

export function customFeedPath(league: LeagueKey, teamSlug: string, publicId: string): string {
  return `/calendar/${league}/${teamSlug}/${publicId}.ics`;
}

export function managePath(publicId: string): string {
  return `/manage/${publicId}`;
}

export function absoluteUrl(path: string, origin: string = appUrl()): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

export function toWebcal(url: string): string {
  return url.replace(/^https?:\/\//, "webcal://");
}

export function googleCalendarSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(toWebcal(feedUrl))}`;
}
