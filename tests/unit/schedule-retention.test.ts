import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../helpers";

// The default next/cache stub runs loaders directly, so it cannot show what the
// cache does with a failed refresh. This fake models the contract sharedSnapshot
// relies on: a fresh entry is served as is; an expired entry is refreshed, and if
// the refresh throws the previous entry keeps being served; a cold miss throws.
const cache = vi.hoisted(() => {
  const entries = new Map<string, { value: unknown; expired: boolean }>();
  return {
    entries,
    unstable_cache: <T>(fn: () => Promise<T>, parts: string[]) => async (): Promise<T> => {
      const id = parts.join("|");
      const entry = entries.get(id);
      if (entry && !entry.expired) return entry.value as T;
      try {
        const value = await fn();
        entries.set(id, { value, expired: false });
        return value;
      } catch (error) {
        if (entry) return entry.value as T;
        throw error;
      }
    },
    expireAll: () => entries.forEach((entry) => { entry.expired = true; }),
  };
});
vi.mock("next/cache", () => ({ unstable_cache: cache.unstable_cache }));

const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/espn/client", async (original) => ({
  ...await original<typeof import("@/lib/espn/client")>(), espnFetchJson: fetchJson,
}));

import { fetchTeamGamesSnapshot } from "@/lib/espn/schedules";
import { resetUpstreamBudget } from "@/lib/cache/shared";

const season = { espnSeason: 2026, displayName: "2026", status: "active" as const };
const good = (url: string) => {
  const type = new URL(url).searchParams.get("seasontype");
  return Promise.resolve(fixture(`schedule-mlb-dodgers-2026-${type === "1" ? "pre" : type === "2" ? "reg" : "post"}.json`));
};

beforeEach(() => {
  cache.entries.clear();
  fetchJson.mockReset();
  fetchJson.mockImplementation(good);
  resetUpstreamBudget();
});

describe("schedule snapshots under a rejected refresh", () => {
  it("keeps serving the last good schedule when a refresh returns a payload without events", async () => {
    const first = await fetchTeamGamesSnapshot("mlb", "19", season);
    expect(first.value).toHaveLength(15);

    cache.expireAll();
    fetchJson.mockImplementation(async () => ({ requestedSeason: { year: 2026 } }));
    const second = await fetchTeamGamesSnapshot("mlb", "19", season);

    expect(second).toEqual(first);
  });

  it("keeps serving the last good schedule when a refresh has a malformed required event", async () => {
    const first = await fetchTeamGamesSnapshot("mlb", "19", season);

    cache.expireAll();
    fetchJson.mockImplementation(async (url: string) => {
      const response = structuredClone(await good(url)) as { events: unknown[] };
      if (response.events.length) response.events[0] = { nope: true };
      return response;
    });

    expect(await fetchTeamGamesSnapshot("mlb", "19", season)).toEqual(first);
  });

  it("surfaces the error and stores nothing on a cold cache, then recovers", async () => {
    fetchJson.mockImplementation(async () => ({ events: "broken" }));
    await expect(fetchTeamGamesSnapshot("mlb", "19", season)).rejects.toThrow();
    expect(cache.entries.size).toBe(0);

    fetchJson.mockImplementation(good);
    expect((await fetchTeamGamesSnapshot("mlb", "19", season)).value).toHaveLength(15);
  });

  it("publishes a legitimately empty schedule as a successful refresh", async () => {
    await fetchTeamGamesSnapshot("mlb", "19", season);
    cache.expireAll();
    fetchJson.mockImplementation(async () => ({ requestedSeason: { year: 2026 }, events: [] }));

    expect((await fetchTeamGamesSnapshot("mlb", "19", season)).value).toEqual([]);
  });
});
