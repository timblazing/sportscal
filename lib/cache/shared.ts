import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { CacheUnavailableError, guardedFetch, withBatchFetch, loadSnapshot, contentHash, type CacheDatabase, type Snapshot } from "@/lib/cache/coordinator";

interface BoundCache extends CacheDatabase {
  withSession?(constraint: "first-primary"): CacheDatabase;
}
interface CacheEnvironment {
  SPORTSCAL_CACHE?: BoundCache;
  /** Explicit application kill switch, checked before any ESPN admission. */
  SPORTS_DATA_DISABLED?: string;
}

export async function getCacheDatabase(): Promise<CacheDatabase | null> {
  let env: CacheEnvironment;
  try {
    env = (await getCloudflareContext({ async: true })).env as CacheEnvironment;
  } catch {
    // Existing deterministic unit tests and local Next development can run
    // outside Cloudflare. Production must never silently lose coordination.
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") return null;
    throw new CacheUnavailableError();
  }
  if (env.SPORTS_DATA_DISABLED === "1" || !env.SPORTSCAL_CACHE) throw new CacheUnavailableError();
  return env.SPORTSCAL_CACHE.withSession?.("first-primary") ?? env.SPORTSCAL_CACHE;
}

export async function sharedSnapshot<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<Snapshot<T>> {
  const db = await getCacheDatabase();
  if (db) return loadSnapshot(db,key,ttlSeconds,loader);
  const value = await loader();
  const now = Date.now();
  return { value, fetchedAt: new Date(now).toISOString(), changedAt: new Date(0).toISOString(), hash: await contentHash(JSON.stringify(value)), freshUntil: now+ttlSeconds*1000, staleUntil: now+ttlSeconds*1000 };
}
export async function sharedLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  return (await sharedSnapshot(key,ttlSeconds,loader)).value;
}
const batchFetch = new AsyncLocalStorage<typeof fetch>();

export async function withUpstreamBatch<T>(maxAttempts: number, callback: () => Promise<T>): Promise<T> {
  const db = await getCacheDatabase();
  if (!db) return callback();
  return withBatchFetch(db,maxAttempts,(fetcher) => batchFetch.run(fetcher,callback));
}

export async function upstreamFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const reserved = batchFetch.getStore();
  if (reserved) return reserved(url,init);
  const db = await getCacheDatabase();
  if (!db) return fetch(url, init);
  return guardedFetch(db,url,init);
}
export { CacheUnavailableError };
