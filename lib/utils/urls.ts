import type { LeagueKey } from "@/lib/config/leagues";

/** Public origin, from NEXT_PUBLIC_APP_URL (e.g. https://sportscal.site). */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
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
