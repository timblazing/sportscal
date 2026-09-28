import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { EspnError } from "@/lib/espn/client";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { SeasonNotFoundError, TeamNotFoundError } from "@/lib/schedule-service";

export const CACHE = {
  /** Public .ics feeds: ~15 min CDN freshness, serve stale while revalidating. */
  feed: "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
  teams: "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
  schedule: "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
  none: "no-store",
} as const;

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": CACHE.none, ...headers } },
  );
}

/** Map known failures to useful, non-scary responses. */
export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(400, "invalid_request", error.issues[0]?.message ?? "Invalid request");
  }
  if (error instanceof TeamNotFoundError) {
    return jsonError(404, "team_not_found", error.message);
  }
  if (error instanceof SeasonNotFoundError) {
    return jsonError(404, "season_not_found", error.message);
  }
  if (error instanceof EspnError) {
    return jsonError(
      502,
      "espn_unavailable",
      "We couldn't refresh this schedule from ESPN. Try again in a moment.",
      { "retry-after": "60" },
    );
  }
  if (error instanceof DatabaseNotConfiguredError) {
    return jsonError(503, "database_unavailable", "Saved calendars aren't available on this deployment.");
  }
  console.error(error);
  return jsonError(500, "internal_error", "Unexpected server error. Try again in a moment.");
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+([A-Za-z0-9_-]{16,128})$/);
  return match ? match[1] : null;
}

/** Reject oversized JSON bodies before parsing. */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ZodError([{ code: "custom", message: "Request body is too large", path: [], input: undefined }]);
  try {
    return JSON.parse(text);
  } catch {
    throw new ZodError([{ code: "custom", message: "Request body must be JSON", path: [], input: undefined }]);
  }
}
