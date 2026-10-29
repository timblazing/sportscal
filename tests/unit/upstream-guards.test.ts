import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicRateLimitError, protectPublic, resetPublicWindows } from "@/lib/cache/abuse";
import { CacheUnavailableError, resetUpstreamBudget, sharedSnapshot, upstreamFetch, withUpstreamBatch } from "@/lib/cache/shared";
import { clientIp } from "@/lib/security/client-ip";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetUpstreamBudget();
  resetPublicWindows();
});

const ok = () => vi.fn(async () => new Response("{}"));

describe("ESPN budget", () => {
  it("cools down after 429/503 instead of retrying per request", async () => {
    const fetch = vi.fn(async () => new Response("busy", { status: 503, headers: { "retry-after": "120" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await upstreamFetch("https://site.api.espn.com/a")).status).toBe(503);
    await expect(upstreamFetch("https://site.api.espn.com/b")).rejects.toBeInstanceOf(CacheUnavailableError);
    await expect(withUpstreamBatch(2, async () => "never")).rejects.toBeInstanceOf(CacheUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("charges a batch once and refuses requests beyond its reservation", async () => {
    const fetch = ok();
    vi.stubGlobal("fetch", fetch);
    await withUpstreamBatch(2, async () => {
      await upstreamFetch("https://site.api.espn.com/1");
      await upstreamFetch("https://site.api.espn.com/2");
      await expect(upstreamFetch("https://site.api.espn.com/3")).rejects.toBeInstanceOf(CacheUnavailableError);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops at the daily ceiling", async () => {
    vi.stubGlobal("fetch", ok());
    for (let i = 0; i < 31; i++) await withUpstreamBatch(32, async () => undefined);
    await withUpstreamBatch(8, async () => undefined);
    await expect(upstreamFetch("https://site.api.espn.com/x")).rejects.toBeInstanceOf(CacheUnavailableError);
  });

  it("makes no ESPN request when the kill switch is set or the key is unknown", async () => {
    const fetch = ok();
    vi.stubGlobal("fetch", fetch);
    const loader = vi.fn(async () => 1);
    await expect(sharedSnapshot("catalog:xfl", 60, loader)).rejects.toBeInstanceOf(CacheUnavailableError);
    vi.stubEnv("SPORTS_DATA_DISABLED", "1");
    await expect(sharedSnapshot("catalog:nfl", 60, loader)).rejects.toBeInstanceOf(CacheUnavailableError);
    await expect(upstreamFetch("https://site.api.espn.com/x")).rejects.toBeInstanceOf(CacheUnavailableError);
    expect(loader).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("public admission", () => {
  const from = (ip: string) => new Request("https://sportscal.site/api/download", { headers: { "x-forwarded-for": ip } });

  it("limits one client without affecting others", async () => {
    for (let i = 0; i < 10; i++) await protectPublic(from("203.0.113.5"), "download");
    await expect(protectPublic(from("203.0.113.5"), "download")).rejects.toBeInstanceOf(PublicRateLimitError);
    await expect(protectPublic(from("198.51.100.7"), "download")).resolves.toBeUndefined();
  });

  it("ignores a client-supplied cf-connecting-ip", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
  });
});
