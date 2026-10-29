import { beforeEach, expect, it, vi } from "vitest";
import { fixture } from "../helpers";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/cache/shared", () => ({
  sharedSnapshot: mocks.snapshot,
  withUpstreamBatch: async (_count: number, load: () => Promise<unknown>) => load(),
}));
vi.mock("@/lib/espn/client", async (original) => ({
  ...await original<typeof import("@/lib/espn/client")>(), espnFetchJson: mocks.fetch,
}));
import { fetchTeamGames } from "@/lib/espn/schedules";
const season = { espnSeason: 2026, displayName: "2026", status: "active" as const };
beforeEach(() => {
  mocks.fetch.mockReset(); mocks.snapshot.mockReset();
  mocks.snapshot.mockImplementation(async (_key, _ttl, load) => ({ value: await load(), fetchedAt: "2026-01-01T00:00:00Z" }));
  mocks.fetch.mockImplementation((url: string) => {
    const type = new URL(url).searchParams.get("seasontype");
    return Promise.resolve(fixture(`schedule-mlb-dodgers-2026-${type === "1" ? "pre" : type === "2" ? "reg" : "post"}.json`));
  });
});
it("stores normalized games under a canonical schedule key with phase-specific freshness", async () => {
  expect(await fetchTeamGames("mlb", "19", season)).toHaveLength(15);
  expect(mocks.snapshot).toHaveBeenLastCalledWith("schedule:mlb:19:2026:active",900,expect.any(Function));
  for (const [,options] of mocks.fetch.mock.calls) expect(options).toEqual({ cache: "none", revalidate: 900 });
  await fetchTeamGames("mlb","19",{...season,status:"completed"});
  expect(mocks.snapshot).toHaveBeenLastCalledWith("schedule:mlb:19:2026:completed",10800,expect.any(Function));
});
it("rejects malformed responses instead of publishing a partial snapshot", async () => {
  mocks.fetch.mockResolvedValue({ events: "broken" });
  await expect(fetchTeamGames("mlb","19",season)).rejects.toThrow();
});
it("never exceeds two concurrent calls in the MLS fanout and rejects transient optional failures", async () => {
  let active=0,peak=0;
  mocks.fetch.mockImplementation(async () => {
    active++; peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,1)); active--;
    return { events:[] };
  });
  await fetchTeamGames("mls","1",season);
  expect(peak).toBe(2);
  mocks.fetch.mockImplementation(async (url:string) => {
    if(new URL(url).searchParams.get("seasontype")==="3") throw new Error("temporary failure");
    return {events:[]};
  });
  await expect(fetchTeamGames("mls","1",season)).rejects.toThrow("temporary failure");
});
