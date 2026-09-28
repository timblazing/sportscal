import type { CatalogTeam } from "@/lib/espn/teams";
import type { ResolvedSeason, SportsCalGame } from "@/lib/types";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

export type { CatalogTeam };

export interface ScheduleResponse {
  team: CatalogTeam;
  season: ResolvedSeason;
  autoSeason: ResolvedSeason;
  games: SportsCalGame[];
  fetchedAt: string;
}

export interface SavedCalendarResponse {
  publicId: string;
  config: CalendarConfig;
  feedPath: string;
  feedUrl: string;
  editToken?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK_MESSAGE = "We couldn't reach SportsCal. Check your connection and try again.";

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(FALLBACK_MESSAGE, 0);
  }
  if (!res.ok) {
    let message = FALLBACK_MESSAGE;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      message = body.error?.message ?? message;
      code = body.error?.code;
    } catch {
      // Non-JSON error body; keep the fallback message.
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Trigger a browser download of the current configuration's .ics snapshot. */
export async function downloadIcs(config: CalendarConfig): Promise<{ filename: string; count: number }> {
  let res: Response;
  try {
    res = await fetch("/api/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
  } catch {
    throw new ApiError(FALLBACK_MESSAGE, 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ApiError(body.error?.message ?? "Download failed. Try again.", res.status);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "sportscal.ics";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, count: Number(res.headers.get("x-sportscal-event-count") ?? 0) };
}
