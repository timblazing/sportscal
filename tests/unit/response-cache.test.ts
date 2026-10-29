import { describe, expect, it, vi } from "vitest";

import { contentEtag, publicResponse, validatedResponse } from "@/lib/cache/response";

const publicBody = () => new Response("calendar bytes", { headers: { "cache-control": "public, max-age=300, s-maxage=900", "x-content-type-options": "nosniff" } });

describe("public responses", () => {
  it("keeps the CDN policy and adds a content validator", async () => {
    const response = await publicResponse(new Request("https://example.com/feed"), async () => publicBody());
    expect(await response.text()).toBe("calendar bytes");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=900");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("etag")).toBe(await contentEtag("calendar bytes"));
  });

  it("returns bodyless conditional GET/HEAD responses", async () => {
    const generate = vi.fn(async () => publicBody());
    const tag = await contentEtag("calendar bytes");
    const conditional = await publicResponse(new Request("https://example.com", { headers: { "if-none-match": `"other", W/${tag}` } }), generate);
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(conditional.headers.get("etag")).toBe(tag);
    const head = await publicResponse(new Request("https://example.com", { method: "HEAD" }), generate);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("etag")).toBe(tag);
  });

  it("keeps credential-bearing requests and errors out of shared caches", async () => {
    for (const headers of [{ authorization: "Bearer secret" }, { cookie: "session=secret" }] as Record<string, string>[]) {
      const response = await publicResponse(new Request("https://example.com", { headers }), async () => publicBody());
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const error = await publicResponse(new Request("https://example.com"), async () => new Response("error", { status: 503, headers: { "cache-control": "no-store" } }));
    expect(error.status).toBe(503);
    expect(error.headers.has("etag")).toBe(false);
  });

  it("custom-feed validators change on config edits", async () => {
    const etag = await contentEtag("old config");
    const request = new Request("https://example.com/custom", { headers: { "if-none-match": etag } });
    const unchanged = await validatedResponse(request, new Response("old config", { headers: { "cache-control": "no-store" } }));
    const changed = await validatedResponse(request, new Response("new config", { headers: { "cache-control": "no-store" } }));
    expect(unchanged.status).toBe(304);
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
  });
});
