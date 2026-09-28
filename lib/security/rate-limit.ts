import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function config() {
  const max = Number(process.env.RATE_LIMIT_MAX ?? 20);
  const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 3600);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 20,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 3600,
  };
}

/** Best-effort client IP from standard proxy headers (set x-forwarded-for at your reverse proxy). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

/** IPs are hashed before storage so no raw addresses are persisted. */
function bucketKey(action: string, ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "sportscal";
  return `${action}:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 40)}`;
}

/**
 * Fixed-window rate limit stored in Postgres so it holds across serverless
 * instances. A single atomic upsert increments or resets the window.
 */
export async function checkRateLimit(action: string, headers: Headers): Promise<RateLimitResult> {
  const { max, windowSeconds } = config();
  const key = bucketKey(action, clientIp(headers));
  const db = getDb();
  const interval = sql.raw(`interval '${Math.floor(windowSeconds)} seconds'`);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - ${interval} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - ${interval} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const elapsed = (Date.now() - row.windowStart.getTime()) / 1000;
  return {
    allowed: row.count <= max,
    remaining: Math.max(0, max - row.count),
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}
