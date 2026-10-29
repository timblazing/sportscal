import "server-only";
import { getCacheDatabase } from "@/lib/cache/shared";
import { contentHash, CacheUnavailableError } from "@/lib/cache/coordinator";

type Kind = "read" | "download" | "feed" | "management";
const POLICY: Record<Kind, { window: number; limit: number }> = {
  read: { window: 60_000, limit: 120 },
  feed: { window: 300_000, limit: 120 },
  download: { window: 60_000, limit: 10 },
  management: { window: 60_000, limit: 30 },
};
export class PublicRateLimitError extends Error {
  constructor() { super("Too many requests. Try again shortly."); this.name = "PublicRateLimitError"; }
}
/** Only misses/expensive requests write here. Fixed hash buckets bound storage;
 * collisions deliberately deny early. CF's trusted IP header is the sole input.
 * 10k global admissions/day bounds downstream management database traffic even
 * when addresses rotate. Writes stay bounded; Workers Paid has no provider cap,
 * so request volume itself is bounded only by edge rules (docs/cloudflare-operations.md). */
export async function protectPublic(request: Request, kind: Kind): Promise<void> {
  const db = await getCacheDatabase();
  if (!db) return; // Deterministic tests / Node dev only; never production fallback.
  const now = Date.now();
  const policy = POLICY[kind];
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const hash = await contentHash(`${process.env.RATE_LIMIT_SALT ?? "sportscal"}:${ip}`);
  const bucket = parseInt(hash.slice(0, 8), 16) % 1024;
  const reserve = (action: string, slot: number, window: number, limit: number) => db.prepare(`
    INSERT INTO public_admissions(action,bucket,window_id,attempts) VALUES(?,?,?,1)
    ON CONFLICT(action,bucket) DO UPDATE SET
      attempts=CASE WHEN public_admissions.window_id<excluded.window_id THEN 1 ELSE public_admissions.attempts+1 END,
      window_id=excluded.window_id
    WHERE public_admissions.window_id<excluded.window_id OR
      (public_admissions.window_id=excluded.window_id AND public_admissions.attempts<?)
    RETURNING bucket`).bind(action, slot, Math.floor(now/window), limit);
  try {
    const global = await reserve("global", 0, 86400_000, 10_000).first();
    if (!global) throw new PublicRateLimitError();
    if (!await reserve(kind,bucket,policy.window,policy.limit).first()) throw new PublicRateLimitError();
  } catch (error) {
    if (error instanceof PublicRateLimitError) throw error;
    throw new CacheUnavailableError();
  }
}
