/** Runtime-independent D1 contracts keep this module directly testable in workerd. */
export interface CacheDatabase {
  prepare(sql: string): CacheStatement;
  batch<T = Record<string, unknown>>(statements: CacheStatement[]): Promise<{ results: T[]; success: boolean }[]>;
}
export interface CacheStatement {
  bind(...values: (string | number | null)[]): CacheStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<unknown>;
}
export const CACHE_LIMITS = {
  slots: 512,
  payloadBytes: 256 * 1024,
  staleMs: 7 * 86400_000,
  leaseMs: 60_000,
  upstreamDaily: 1000,
  upstreamTimeoutMs: 10_000,
  permitMs: 30_000,
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
  changedAt: string;
  hash: string;
  freshUntil: number;
  staleUntil: number;
}
interface Row {
  cache_key: string;
  payload: string | null;
  fetched_at: number;
  changed_at: number;
  fresh_until: number;
  stale_until: number;
  content_hash: string | null;
}
const LEAGUE = "(?:nfl|nba|nhl|ncaaf|ncaab|mlb|wnba|mls|epl)";
const KEY = new RegExp(`^(?:catalog:${LEAGUE}|team:${LEAGUE}:[0-9]{1,10}|season:${LEAGUE}:(?:current|[0-9]{8})|schedule:${LEAGUE}:[0-9]{1,10}:[0-9]{4}:(?:active|upcoming|completed))$`);

export async function contentHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
function snapshot<T>(row: Row): Snapshot<T> {
  return { value: JSON.parse(row.payload!), fetchedAt: new Date(row.fetched_at).toISOString(), changedAt: new Date(row.changed_at).toISOString(), hash: row.content_hash!, freshUntil: row.fresh_until, staleUntil: row.stale_until };
}

/** Fixed slots bound both successful data and coordination records. Collisions
 * evict on successful refresh only; no request-driven scans or growing rows. */
export async function loadSnapshot<T>(
  db: CacheDatabase, key: string, ttlSeconds: number, loader: () => Promise<T>, now = Date.now(),
): Promise<Snapshot<T>> {
  if (!KEY.test(key) || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 86400) throw new CacheUnavailableError();
  let fallback: Snapshot<T> | undefined;
  try {
    const slot = parseInt((await contentHash(key)).slice(0, 8), 16) % CACHE_LIMITS.slots;
    const row = await db.prepare("SELECT cache_key,payload,fetched_at,changed_at,fresh_until,stale_until,content_hash FROM cache_entries WHERE slot=?").bind(slot).first<Row>();
    if (row?.cache_key === key && row.payload && row.stale_until > now) {
      fallback = snapshot<T>(row);
      if (row.fresh_until > now) return fallback;
    }
    const token = crypto.randomUUID();
    // A single primary SQL statement is the lease compare-and-swap. Preserve
    // the old key and value until the replacement has completely succeeded.
    const claim = await db.prepare(`INSERT INTO cache_entries(slot,cache_key,lease_token,lease_until)
      VALUES(?,?,?,?) ON CONFLICT(slot) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until
      WHERE cache_entries.lease_until<=? AND (cache_entries.cache_key!=? OR cache_entries.fresh_until<=?)
      RETURNING slot`).bind(slot,key,token,now+CACHE_LIMITS.leaseMs,now,key,now).first();
    if (!claim) {
      if (fallback) return fallback;
      throw new CacheUnavailableError();
    }
    const value = await loader();
    const payload = JSON.stringify(value);
    if (!payload || new TextEncoder().encode(payload).byteLength > CACHE_LIMITS.payloadBytes) throw new CacheUnavailableError();
    const hash = await contentHash(payload);
    const completedAt = Date.now();
    const result = await db.prepare(`UPDATE cache_entries SET changed_at=CASE WHEN cache_key=? AND content_hash=? THEN changed_at ELSE ? END,cache_key=?,payload=?,fetched_at=?,fresh_until=?,stale_until=?,content_hash=?,lease_token=NULL,lease_until=0
      WHERE slot=? AND lease_token=? AND lease_until>? RETURNING changed_at`)
      .bind(key,hash,completedAt,key,payload,completedAt,completedAt+ttlSeconds*1000,completedAt+CACHE_LIMITS.staleMs,hash,slot,token,completedAt).first<{changed_at:number}>();
    // A timed-out/crashed owner must not overwrite a newer owner's snapshot.
    if (!result) throw new CacheUnavailableError();
    return { value, fetchedAt: new Date(completedAt).toISOString(), changedAt: new Date(result.changed_at).toISOString(), hash, freshUntil: completedAt+ttlSeconds*1000, staleUntil: completedAt+CACHE_LIMITS.staleMs };
  } catch {
    // Failed probes keep their lease as a persisted per-key cooldown. No
    // exceptions, quota failures, or ambiguous writes trigger direct fallback.
    if (fallback && fallback.staleUntil > Date.now()) return fallback;
    throw new CacheUnavailableError();
  }
}

export function retryAfterMs(header: string | null, now: number): number {
  let delay = 60_000;
  if (header && /^\d+$/.test(header.trim())) delay = Number(header) * 1000;
  else if (header) {
    const parsed = Date.parse(header);
    if (Number.isFinite(parsed)) delay = Math.max(0, parsed - now);
  }
  // A minimum protects against Retry-After: 0, malformed, or past dates.
  return Math.min(CACHE_LIMITS.maxCooldownMs, Math.max(60_000, delay)) + Math.floor(Math.random()*1000);
}

/** Atomically reserve an attempted request before any network I/O. Permits and
 * counters survive isolate restart; failed/uncertain attempts are never refunded. */
export async function guardedFetch(
  db: CacheDatabase, url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch,
): Promise<Response> {
  const now = Date.now();
  const day = Math.floor(now / 86400_000);
  const token = crypto.randomUUID();
  let admitted = false;
  try {
    const results = await db.batch([
      db.prepare("UPDATE upstream_budget SET budget_day=?,attempts=0 WHERE id=1 AND budget_day<?").bind(day,day),
      db.prepare(`UPDATE upstream_permits SET token=?,expires_at=? WHERE slot=(SELECT slot FROM upstream_permits WHERE expires_at<=? ORDER BY slot LIMIT 1)
        AND EXISTS(SELECT 1 FROM upstream_budget WHERE id=1 AND budget_day=? AND attempts<? AND cooldown_until<=?) RETURNING slot`)
        .bind(token,now+CACHE_LIMITS.permitMs,now,day,CACHE_LIMITS.upstreamDaily,now),
      db.prepare("UPDATE upstream_budget SET attempts=attempts+1 WHERE id=1 AND EXISTS(SELECT 1 FROM upstream_permits WHERE token=?)").bind(token),
    ]);
    admitted = results.every((r) => r.success) && results[1].results.length === 1;
    if (!admitted) throw new CacheUnavailableError();
    // Timeout is shorter than the durable permit. Never retry automatically.
    const timeout = AbortSignal.timeout(CACHE_LIMITS.upstreamTimeoutMs);
    const response = await fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    if (response.status === 429 || response.status === 503) {
      const until = Date.now()+retryAfterMs(response.headers.get("retry-after"),Date.now());
      await db.prepare("UPDATE upstream_budget SET cooldown_until=MAX(cooldown_until,?) WHERE id=1").bind(until).run();
    }
    // fetch resolves on headers: retain the permit until the body is consumed
    // or cancelled, so large JSON bodies also count against concurrency.
    const body = response.body;
    if (!body) {
      await releasePermit(db,token);
      return response;
    }
    const reader = body.getReader();
    const wrapped = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) { await releasePermit(db,token); controller.close(); }
          else controller.enqueue(part.value);
        } catch (error) { await releasePermit(db,token); controller.error(error); }
      },
      async cancel(reason) { try { await reader.cancel(reason); } finally { await releasePermit(db,token); } },
    });
    return new Response(wrapped, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    // On network failures retain the permit until expiry. A failed coordinator
    // cannot safely determine whether a timed-out attempt is still running.
    if (error instanceof CacheUnavailableError) throw error;
    throw new CacheUnavailableError();
  }
}
async function releasePermit(db: CacheDatabase, token: string) {
  try { await db.prepare("UPDATE upstream_permits SET token=NULL,expires_at=0 WHERE token=?").bind(token).run(); }
  catch { /* Expiry recovers capacity; never refund an attempted request. */ }
}

/** Reserve a schedule's entire known fan-out once. Two durable slots cover at
 * most two concurrent fetch/body operations; all attempts are charged up front.
 * The whole operation aborts before the durable lease expires. */
export async function withBatchFetch<T>(
  db: CacheDatabase, maxAttempts: number, callback: (fetcher: typeof fetch) => Promise<T>, networkFetch: typeof fetch = fetch,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32) throw new CacheUnavailableError();
  const now=Date.now();
  const day=Math.floor(now/86400_000);
  const token=crypto.randomUUID();
  const admission=await db.batch([
    db.prepare("UPDATE upstream_budget SET budget_day=?,attempts=0 WHERE id=1 AND budget_day<?").bind(day,day),
    db.prepare(`UPDATE upstream_permits SET token=?,expires_at=? WHERE slot IN
      (SELECT slot FROM upstream_permits WHERE expires_at<=? ORDER BY slot LIMIT 2)
      AND (SELECT COUNT(*) FROM upstream_permits WHERE expires_at<=?)>=2
      AND EXISTS(SELECT 1 FROM upstream_budget WHERE id=1 AND budget_day=? AND attempts+?<=? AND cooldown_until<=?) RETURNING slot`)
      .bind(token,now+CACHE_LIMITS.permitMs,now,now,day,maxAttempts,CACHE_LIMITS.upstreamDaily,now),
    db.prepare("UPDATE upstream_budget SET attempts=attempts+? WHERE id=1 AND (SELECT COUNT(*) FROM upstream_permits WHERE token=?)=2").bind(maxAttempts,token),
  ]);
  if (!admission.every((r)=>r.success) || admission[1].results.length!==2) throw new CacheUnavailableError();
  const controller=new AbortController();
  const deadline=now+25_000;
  const timer=setTimeout(()=>controller.abort(),Math.max(0,deadline-Date.now()));
  let attempts=0;
  let active=0;
  let blocked=false;
  const fetcher: typeof fetch=async(input,init={})=>{
    if (blocked || controller.signal.aborted || Date.now()>=deadline || attempts>=maxAttempts || active>=2) throw new CacheUnavailableError();
    attempts++;
    active++;
    try {
      const timeout=AbortSignal.timeout(CACHE_LIMITS.upstreamTimeoutMs);
      const signal=AbortSignal.any([controller.signal,timeout,...(init.signal?[init.signal]:[])]);
      const response=await networkFetch(input,{...init,signal});
      if(response.status===429 || response.status===503) {
        blocked=true;
        await db.prepare("UPDATE upstream_budget SET cooldown_until=MAX(cooldown_until,?) WHERE id=1")
          .bind(Date.now()+retryAfterMs(response.headers.get("retry-after"),Date.now())).run();
      }
      if(!response.body) { active--; return response; }
      const reader=response.body.getReader();
      let released=false;
      const release=()=>{if(!released){released=true;active--;}};
      const body=new ReadableStream<Uint8Array>({
        async pull(out){try{const part=await reader.read();if(part.done){release();out.close();}else out.enqueue(part.value);}catch(error){release();out.error(error);}},
        async cancel(reason){try{await reader.cancel(reason);}finally{release();}},
      });
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(error){active--;throw error;}
  };
  try {
    // The callback's next request also checks the deadline. Abort every current
    // fetch on expiry; callbacks cannot continue using an expired reservation.
    return await callback(fetcher);
  }finally{
    clearTimeout(timer);
    controller.abort();
    await releasePermit(db,token);
  }
}
