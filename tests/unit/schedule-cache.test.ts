import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../helpers";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  cache: new Map<string, unknown>(),
  options: vi.fn(),
}));
vi.mock("@/lib/espn/client", async (original) => ({
  ...await original<typeof import("@/lib/espn/client")>(), espnFetchJson: mocks.fetch,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, keys: string[], options: unknown) => async () => {
    mocks.options(keys, options);
    const key = JSON.stringify(keys);
    if (mocks.cache.has(key)) return mocks.cache.get(key);
    const result = await fn();
    mocks.cache.set(key, result);
    return result;
  },
}));
import { fetchTeamGames } from "@/lib/espn/schedules";

const season = { espnSeason: 2026, displayName: "2026", status: "active" as const };
beforeEach(() => {
  mocks.fetch.mockReset(); mocks.cache.clear(); mocks.options.mockClear();
  mocks.fetch.mockImplementation((url: string) => {
    const type = new URL(url).searchParams.get("seasontype");
    return Promise.resolve(fixture(`schedule-mlb-dodgers-2026-${type === "1" ? "pre" : type === "2" ? "reg" : "post"}.json`));
  });
});

describe("normalized schedule caching", () => {
  it("caches the complete normalized schedule and bypasses both raw caches", async () => {
    const first = await fetchTeamGames("mlb", "19", season);
    const second = await fetchTeamGames("mlb", "19", season);
    expect(second).toEqual(first);
    expect(first).toHaveLength(15);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    for (const [, options] of mocks.fetch.mock.calls) expect(options).toEqual({ cache: "none", revalidate: 900 });
    expect(mocks.options.mock.calls[0][1]).toEqual({ revalidate: 900, tags: ["schedule:mlb:19"] });
    await fetchTeamGames("mlb", "19", { ...season, status: "completed" });
    expect(mocks.fetch).toHaveBeenCalledTimes(6);
    expect(mocks.options.mock.calls.at(-1)![1]).toEqual({ revalidate: 10800, tags: ["schedule:mlb:19"] });
  });
  it("falls back to normalized games after failed refresh without caching the failure", async () => {
    const first = await fetchTeamGames("mlb", "19", season);
    mocks.cache.clear();
    mocks.fetch.mockRejectedValue(new Error("ESPN unavailable"));
    expect(await fetchTeamGames("mlb", "19", season)).toEqual(first);
    expect(mocks.cache.size).toBe(0);
    await expect(fetchTeamGames("mlb", "11", season)).rejects.toThrow("ESPN unavailable");
    await expect(fetchTeamGames("mlb", "19", { ...season, espnSeason: 2027 })).rejects.toThrow("ESPN unavailable");
  });
  it("does not replace good games with malformed responses", async () => {
    const first = await fetchTeamGames("mlb", "19", season);
    mocks.cache.clear(); mocks.fetch.mockResolvedValue({ events: "broken" });
    expect(await fetchTeamGames("mlb", "19", season)).toEqual(first);
    expect(mocks.cache.size).toBe(0);
  });
  it("bounds normalized fallback memory and evicts the oldest schedule", async () => {
    mocks.fetch.mockResolvedValue({ events: [] });
    for (let i = 0; i <= 100; i++) await fetchTeamGames("mlb", String(1000 + i), season);
    mocks.cache.clear(); mocks.fetch.mockRejectedValue(new Error("offline"));
    await expect(fetchTeamGames("mlb", "1000", season)).rejects.toThrow("offline");
    expect(await fetchTeamGames("mlb", "1100", season)).toEqual([]);
  });

});
