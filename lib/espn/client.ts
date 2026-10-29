import "server-only";
import { upstreamFetch, CacheUnavailableError } from "@/lib/cache/shared";

import type { LeagueConfig } from "@/lib/config/leagues";

/**
 * The only place that knows ESPN hostnames. URLs are always assembled from the
 * league registry plus validated path segments, so user input can never pick
 * an arbitrary upstream host (SSRF protection).
 */
const BASES = {
  /** Site API: teams, groups, schedules. */
  site: "https://site.api.espn.com/apis/site/v2/sports",
  /** Site API v2 standings (conference membership). */
  standings: "https://site.api.espn.com/apis/v2/sports",
  // The core API (sports.core.api.espn.com) answers 403 to Cloudflare Workers,
  // so seasons come from the site scoreboard instead.
} as const;

export type EspnApi = keyof typeof BASES;

/** Revalidation windows in seconds. */
export const REVALIDATE = {
  teams: 60 * 60 * 24,
  seasons: 60 * 60 * 6,
  activeSchedule: 60 * 15,
  offseasonSchedule: 60 * 60 * 3,
} as const;

const SEGMENT_RE = /^[a-z0-9-]+$/i;
const REQUEST_TIMEOUT_MS = 10_000;

export class EspnError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message);
    this.name = "EspnError";
  }
}

export class EspnNotFoundError extends EspnError {
  constructor(url: string) {
    super("ESPN resource not found", 404, url);
    this.name = "EspnNotFoundError";
  }
}

export function buildEspnUrl(
  api: EspnApi,
  league: LeagueConfig,
  segments: (string | number)[],
  query: Record<string, string | number | boolean | undefined> = {},
): string {
  const parts = segments.map(String);
  for (const part of parts) {
    if (!SEGMENT_RE.test(part)) throw new EspnError(`Invalid ESPN path segment: ${part}`);
  }
  const leaguePath = `${league.sport}/${league.league}`;
  const url = new URL(`${BASES[api]}/${leaguePath}${parts.length ? `/${parts.join("/")}` : ""}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface EspnFetchOptions {
  revalidate: number;
  /** Skip both the raw fetch cache and the raw last-good memory map. */
  cache?: "none";
  tags?: string[];
}

export async function espnFetchJson(url: string, _options: EspnFetchOptions): Promise<unknown> {
  void _options; // Raw responses never persist; normalized snapshots own freshness.
  try {
    const res = await upstreamFetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 404) throw new EspnNotFoundError(url);
      throw new EspnError(`ESPN responded with ${res.status}`, res.status, url);
    }
    const data: unknown = await res.json();
    // The core API reports missing resources in the body with a 200/404 mix.
    if (isCoreError(data)) {
      if (data.error.code === 404) throw new EspnNotFoundError(url);
      throw new EspnError(data.error.message ?? "ESPN error", data.error.code, url);
    }
    return data;
  } catch (error) {
    if (error instanceof CacheUnavailableError) throw error;
    if (error instanceof EspnNotFoundError) throw error;
    if (error instanceof EspnError) throw error;
    throw new EspnError(
      error instanceof Error ? `Unable to reach ESPN: ${error.message}` : "Unable to reach ESPN",
      undefined,
      url,
    );
  }
}

function isCoreError(data: unknown): data is { error: { code?: number; message?: string } } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "object" &&
    (data as { error: unknown }).error !== null
  );
}
