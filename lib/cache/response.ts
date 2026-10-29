import "server-only";

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

/** Saved feeds use validators, but stay no-store so no shared cache keeps them. */
export async function validatedResponse(request: Request, response: Response): Promise<Response> {
  if (response.status !== 200) return conditionalResponse(request, response);
  const body = await response.text();
  const headers = new Headers(response.headers);
  headers.set("etag", await contentEtag(body));
  return conditionalResponse(request, new Response(body, { status: 200, headers }));
}

/**
 * Public responses carry their CDN policy in cache-control, so Vercel's CDN
 * serves repeats without invoking the function. Add a content validator and
 * answer conditional and HEAD requests here for the misses that do arrive.
 */
export async function publicResponse(request: Request, generate: () => Promise<Response>): Promise<Response> {
  const generated = await generate();
  if (generated.status !== 200) return conditionalResponse(request, generated);
  const body = await generated.text();
  const headers = new Headers(generated.headers);
  if (!cacheableRequest(request)) headers.set("cache-control", "no-store");
  headers.set("etag", await contentEtag(body));
  return conditionalResponse(request, new Response(body, { status: 200, headers }));
}
