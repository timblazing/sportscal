import { afterEach, describe, expect, it, vi } from "vitest";

import { contentEtag, publicResponse, validatedResponse } from "@/lib/cache/response";

function fakeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); }),
  };
  vi.stubGlobal("caches", { default: cache });
  return { cache, entries };
}
const publicBody = () => new Response("calendar bytes", { headers: { "cache-control": "public, max-age=300, s-maxage=900", "x-content-type-options": "nosniff" } });

afterEach(() => vi.unstubAllGlobals());

describe("regional public response cache", () => {
  it("reuses a normalized key independent of arbitrary request host", async () => {
    const { cache } = fakeCache();
    const generate = vi.fn(async () => publicBody());
    const first = await publicResponse(new Request("https://one.example/feed"), "feed/nfl/steelers.ics", 900, generate);
    const second = await publicResponse(new Request("https://two.example/feed"), "feed/nfl/steelers.ics", 900, generate);
    expect(await second.text()).toBe(await first.text());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][0].url).toBe("https://sportscal-cache.invalid/v1/feed/nfl/steelers.ics");
    expect(second.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=900");
    expect(second.headers.get("x-content-type-options")).toBe("nosniff");
    expect(second.headers.has("x-sportscal-response-policy")).toBe(false);
  });

  it("returns validators and bodyless conditional GET/HEAD responses", async () => {
    fakeCache();
    const generate = vi.fn(async () => publicBody());
    const first = await publicResponse(new Request("https://example.com"), "feed/test", 300, generate);
    const tag = first.headers.get("etag")!;
    const conditional = await publicResponse(new Request("https://example.com", { headers: { "if-none-match": `"other", W/${tag}` } }), "feed/test", 300, generate);
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(conditional.headers.get("etag")).toBe(tag);
    const head = await publicResponse(new Request("https://example.com", { method: "HEAD" }), "feed/test", 300, generate);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("etag")).toBe(tag);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("never stores errors, credential-bearing requests, cookies, or no-store responses", async () => {
    const { cache } = fakeCache();
    await publicResponse(new Request("https://example.com"), "error", 300, async () => new Response("error", { status: 503 }));
    await publicResponse(new Request("https://example.com", { headers: { authorization: "Bearer secret" } }), "auth", 300, async () => publicBody());
    await publicResponse(new Request("https://example.com", { headers: { cookie: "session=secret" } }), "cookie", 300, async () => publicBody());
    await publicResponse(new Request("https://example.com"), "private", 300, async () => new Response("custom", { headers: { "cache-control": "no-store" } }));
    await publicResponse(new Request("https://example.com"), "set-cookie", 300, async () => new Response("private", { headers: { "set-cookie": "session=secret" } }));
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("tolerates regional Cache API failure without retrying the loader", async () => {
    const { cache } = fakeCache();
    cache.match.mockRejectedValue(new Error("cache unavailable"));
    cache.put.mockRejectedValue(new Error("cache unavailable"));
    const generate = vi.fn(async () => publicBody());
    const response = await publicResponse(new Request("https://example.com"), "feed/test", 300, generate);
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("custom-feed validators change on config edits and never enter Cache API", async () => {
    const { cache } = fakeCache();
    const etag = await contentEtag("old config");
    const request = new Request("https://example.com/custom", { headers: { "if-none-match": etag } });
    const unchanged = await validatedResponse(request, new Response("old config", { headers: { "cache-control": "no-store" } }));
    const changed = await validatedResponse(request, new Response("new config", { headers: { "cache-control": "no-store" } }));
    expect(unchanged.status).toBe(304);
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
