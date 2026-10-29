import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_cache } from "next/cache";

export const UPSTREAM_LIMITS = {
  /** Per function instance. Normalized data cache entries keep real usage far lower. */
  daily: 1000,
  timeoutMs: 10_000,
  maxCooldownMs: 6 * 3600_000,
} as const;

export class CacheUnavailableError extends Error {
  constructor() {
    super("Public sports data is temporarily unavailable");
    this.name = "CacheUnavailableError";
  }
}

export interface Snapshot<T> {
  value: T;
  fetchedAt: string;
}

const LEAGUE = "(?:nfl|nba|nhl|ncaaf|ncaab|mlb|wnba|mls|epl)";
const KEY = new RegExp(`^(?:catalog:${LEAGUE}|team:${LEAGUE}:[0-9]{1,10}|season:${LEAGUE}:(?:current|[0-9]{8})|schedule:${LEAGUE}:[0-9]{1,10}:[0-9]{4}:(?:active|upcoming|completed))$`);

function disabled(): boolean {
  // Explicit application kill switch, checked before any ESPN request.
  return process.env.SPORTS_DATA_DISABLED === "1";
}

/**
 * Normalized data in Next's data cache, shared by every function instance on
 * Vercel. A failed background refresh keeps serving the previous entry; only a
 * cold miss surfaces the upstream error. Keys come from validated parameters
 * only, so the number of entries stays bounded.
 */
export async function sharedSnapshot<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<Snapshot<T>> {
  if (disabled() || !KEY.test(key) || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 86400) {
    throw new CacheUnavailableError();
  }
  const load = unstable_cache(
    async (): Promise<Snapshot<T>> => ({ value: await loader(), fetchedAt: new Date().toISOString() }),
    ["sportscal-snapshot-v1", key],
    { revalidate: ttlSeconds, tags: [key] },
  );
  return load();
}

export async function sharedLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  return (await sharedSnapshot(key, ttlSeconds, loader)).value;
}

export function retryAfterMs(header: string | null, now: number): number {
  let delay = 60_000;
  if (header && /^\d+$/.test(header.trim())) delay = Number(header) * 1000;
  else if (header) {
    const parsed = Date.parse(header);
    if (Number.isFinite(parsed)) delay = Math.max(0, parsed - now);
  }
  // A minimum protects against Retry-After: 0, malformed, or past dates.
  return Math.min(UPSTREAM_LIMITS.maxCooldownMs, Math.max(60_000, delay)) + Math.floor(Math.random() * 1000);
}

// Instance-local budget: a ceiling on ESPN traffic from runaway misses, plus a
// cooldown after ESPN says 429/503 so no request retries it in the meantime.
const budget = { day: -1, attempts: 0, cooldownUntil: 0 };
const prepaid = new AsyncLocalStorage<{ remaining: number }>();

function admit(count: number) {
  const now = Date.now();
  const day = Math.floor(now / 86400_000);
  if (budget.day !== day) Object.assign(budget, { day, attempts: 0 });
  if (disabled() || budget.cooldownUntil > now || budget.attempts + count > UPSTREAM_LIMITS.daily) {
    throw new CacheUnavailableError();
  }
  budget.attempts += count;
}

/** Charge a schedule's entire known fan-out once, before any request. */
export async function withUpstreamBatch<T>(maxAttempts: number, callback: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32) throw new CacheUnavailableError();
  admit(maxAttempts);
  return prepaid.run({ remaining: maxAttempts }, callback);
}

export async function upstreamFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const reserved = prepaid.getStore();
  if (!reserved) admit(1);
  else if (reserved.remaining-- <= 0 || budget.cooldownUntil > Date.now()) throw new CacheUnavailableError();
  // Never retried automatically; failed attempts stay charged.
  const timeout = AbortSignal.timeout(UPSTREAM_LIMITS.timeoutMs);
  const response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  if (response.status === 429 || response.status === 503) {
    budget.cooldownUntil = Math.max(budget.cooldownUntil, Date.now() + retryAfterMs(response.headers.get("retry-after"), Date.now()));
  }
  return response;
}

/** Test hook: clear the instance-local budget and cooldown. */
export function resetUpstreamBudget() {
  Object.assign(budget, { day: -1, attempts: 0, cooldownUntil: 0 });
}
