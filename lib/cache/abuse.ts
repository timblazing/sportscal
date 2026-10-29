import "server-only";
import { createHash } from "node:crypto";

import { clientIp } from "@/lib/security/client-ip";

type Kind = "read" | "download" | "feed" | "management";
const POLICY: Record<Kind, { window: number; limit: number }> = {
  read: { window: 60_000, limit: 120 },
  feed: { window: 300_000, limit: 120 },
  download: { window: 60_000, limit: 10 },
  management: { window: 60_000, limit: 30 },
};
const GLOBAL = { window: 86400_000, limit: 10_000 };
const BUCKETS = 1024;

export class PublicRateLimitError extends Error {
  constructor() { super("Too many requests. Try again shortly."); this.name = "PublicRateLimitError"; }
}

const windows = new Map<string, { id: number; attempts: number }>();

function reserve(key: string, window: number, limit: number, now: number): boolean {
  const id = Math.floor(now / window);
  const entry = windows.get(key);
  if (!entry || entry.id < id) {
    windows.set(key, { id, attempts: 1 });
    return true;
  }
  if (entry.attempts >= limit) return false;
  entry.attempts++;
  return true;
}

/**
 * Instance-local fixed windows for misses and expensive requests; CDN hits never
 * reach this. Hash buckets cap memory at 4 * 1024 entries, and collisions only
 * deny early. The global ceiling bounds database work per instance when
 * addresses rotate. Vercel's plan limits are the billing boundary
 * (docs/hosting.md); this keeps one client from using them up.
 */
export async function protectPublic(request: Request, kind: Kind): Promise<void> {
  const now = Date.now();
  const policy = POLICY[kind];
  const hash = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "sportscal"}:${clientIp(request.headers)}`).digest();
  const bucket = hash.readUInt32BE(0) % BUCKETS;
  // Per-client first, so one client's denied requests never use up the global ceiling.
  if (!reserve(`${kind}:${bucket}`, policy.window, policy.limit, now)) throw new PublicRateLimitError();
  if (!reserve("global", GLOBAL.window, GLOBAL.limit, now)) throw new PublicRateLimitError();
}

/** Test hook: clear all windows. */
export function resetPublicWindows() {
  windows.clear();
}
