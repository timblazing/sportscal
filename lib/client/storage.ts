/**
 * localStorage is a convenience only (last selection, unsaved builder state,
 * edit tokens for calendars created in this browser). Public feeds never
 * depend on it. Every access is guarded: storage may be unavailable.
 */
import type { LeagueKey } from "@/lib/config/leagues";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

const BUILDER_KEY = "sportscal:builder:v1";
const CALENDARS_KEY = "sportscal:calendars:v1";

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — safe to ignore.
  }
}

export type BuilderSettings = Omit<CalendarConfig, "league" | "teamId" | "teamSlug">;

export interface StoredBuilderState {
  league?: LeagueKey;
  teamSlug?: string;
  settings?: Partial<BuilderSettings>;
}

export function loadBuilderState(): StoredBuilderState {
  return read<StoredBuilderState>(BUILDER_KEY) ?? {};
}

export function saveBuilderState(state: StoredBuilderState) {
  write(BUILDER_KEY, state);
}

export interface StoredCalendar {
  publicId: string;
  editToken: string;
  league: LeagueKey;
  teamSlug: string;
  teamName: string;
  feedPath: string;
  createdAt: string;
}

export function listStoredCalendars(): StoredCalendar[] {
  const list = read<StoredCalendar[]>(CALENDARS_KEY);
  return Array.isArray(list) ? list : [];
}

export function getStoredCalendar(publicId: string): StoredCalendar | undefined {
  return listStoredCalendars().find((c) => c.publicId === publicId);
}

export function saveStoredCalendar(calendar: StoredCalendar) {
  const others = listStoredCalendars().filter((c) => c.publicId !== calendar.publicId);
  write(CALENDARS_KEY, [calendar, ...others].slice(0, 50));
}

export function updateStoredCalendar(publicId: string, patch: Partial<StoredCalendar>) {
  const list = listStoredCalendars();
  const existing = list.find((c) => c.publicId === publicId);
  if (!existing) return;
  saveStoredCalendar({ ...existing, ...patch });
}

export function removeStoredCalendar(publicId: string) {
  write(
    CALENDARS_KEY,
    listStoredCalendars().filter((c) => c.publicId !== publicId),
  );
}
