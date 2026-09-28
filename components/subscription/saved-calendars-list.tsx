"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { listStoredCalendars, type StoredCalendar } from "@/lib/client/storage";
import { LEAGUES } from "@/lib/config/leagues";

const EMPTY: StoredCalendar[] = [];
let cache: { raw: string; list: StoredCalendar[] } | undefined;

function snapshot(): StoredCalendar[] {
  const list = listStoredCalendars();
  const raw = JSON.stringify(list);
  if (cache?.raw !== raw) cache = { raw, list };
  return cache.list;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Custom calendars created in this browser (edit tokens live only in localStorage). */
export function SavedCalendarsList() {
  const calendars = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  if (calendars.length === 0) return null;
  return (
    <section aria-labelledby="saved-heading" className="mt-16 max-w-xl space-y-2">
      <h2 id="saved-heading" className="text-sm font-medium text-foreground">
        Your saved calendars
      </h2>
      <p className="text-xs text-muted-foreground">Stored in this browser only.</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {calendars.map((c) => (
          <li key={c.publicId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 truncate">
              {c.teamName}{" "}
              <span className="text-muted-foreground">· {LEAGUES[c.league]?.label ?? c.league}</span>
            </span>
            <Link
              href={`/manage/${c.publicId}`}
              className="shrink-0 rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Manage
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
