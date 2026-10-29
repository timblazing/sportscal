import "server-only";

/** Regional acceleration only. Normalized shared data remains authoritative. */
const CACHE_ORIGIN = "https://sportscal-cache.invalid";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function regionalCache(): Cache | undefined {
  return (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
}

function cacheableRequest(request: Request): boolean {
  return (request.method === "GET" || request.method === "HEAD") &&
    !request.headers.has("authorization") && !request.headers.has("cookie");
}

/** A content validator covers actual bytes, including calendar config changes. */
export async function contentEtag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return `"${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("")}"`;
}

function conditionMatches(request: Request, etag: string): boolean {
  const condition = request.headers.get("if-none-match");
  return condition?.split(",").some((part) => {
    const value = part.trim();
    return value === "*" || value.replace(/^W\//, "") === etag.replace(/^W\//, "");
  }) ?? false;
}

export function conditionalResponse(request: Request, response: Response): Response {
  const etag = response.headers.get("etag");
  if (response.status === 200 && etag && conditionMatches(request, etag)) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}

/** Saved feeds use validators, but deliberately never enter a shared cache. */
export async function validatedResponse(request: Request, response: Response): Promise<Response> {
  if (response.status !== 200) return conditionalResponse(request, response);
  const body = await response.text();
  const headers = new Headers(response.headers);
  headers.set("etag", await contentEtag(body));
  return conditionalResponse(request, new Response(body, { status: 200, headers }));
}

/**
 * key contains only parsed application parameters, never request headers/host.
 * Store GET representations for HEAD and apply conditionals only after lookup.
 * A cache failure has no effect on correctness or shared upstream budgeting.
 */
export async function publicResponse(
  request: Request,
  key: string,
  ttlSeconds: number,
  generate: () => Promise<Response>,
): Promise<Response> {
  const cache = cacheableRequest(request) ? regionalCache() : undefined;
  const cacheRequest = new Request(`${CACHE_ORIGIN}/v1/${key}`);
  if (cache) {
    try {
      const hit = await cache.match(cacheRequest);
      if (hit) {
        const headers = new Headers(hit.headers);
        const policy = headers.get("x-sportscal-response-policy");
        if (policy) headers.set("cache-control", policy);
        headers.delete("x-sportscal-response-policy");
        return conditionalResponse(request, new Response(hit.body, { status: hit.status, headers }));
      }
    } catch { /* Regional cache is optional. Shared data never bypasses its gate. */ }
  }
  const generated = await generate();
  if (generated.status !== 200) return conditionalResponse(request, generated);
  const body = await generated.text();
  const headers = new Headers(generated.headers);
  if (!cacheableRequest(request)) headers.set("cache-control", "no-store");
  headers.set("etag", await contentEtag(body));
  const response = new Response(body, { status: 200, headers });
  if (cache && !headers.has("set-cookie") && !headers.get("cache-control")?.includes("no-store") &&
      new TextEncoder().encode(body).byteLength <= MAX_RESPONSE_BYTES) {
    const cached = response.clone();
    // Cache API ignores stale-while-revalidate. Its lifetime is explicit/bounded.
    cached.headers.set("cache-control", `public, max-age=${Math.max(1, Math.floor(ttlSeconds))}`);
    // Preserve browser/CDN policy separately; avoid returning internal cache TTL.
    cached.headers.set("x-sportscal-response-policy", headers.get("cache-control") ?? "no-store");
    try { await cache.put(cacheRequest, cached); } catch { /* Optional acceleration. */ }
  }
  return conditionalResponse(request, response);
}
