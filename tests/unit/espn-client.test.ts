import { afterEach, expect, it, vi } from "vitest";
import { espnFetchJson } from "@/lib/espn/client";
afterEach(() => vi.unstubAllGlobals());
it("cache:none uses no-store and never retains or reads raw last-good responses", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ large: "raw" }) });
  vi.stubGlobal("fetch", fetch);
  const url = "https://example.test/mlb-schedule";
  await espnFetchJson(url, { revalidate: 900, cache: "none" });
  expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  expect(fetch.mock.calls[0][1]).not.toHaveProperty("next");
  fetch.mockRejectedValue(new Error("offline"));
  await expect(espnFetchJson(url, { revalidate: 900, cache: "none" })).rejects.toThrow("offline");
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ normal: true }) });
  await espnFetchJson(url, { revalidate: 900 });
  fetch.mockRejectedValue(new Error("offline"));
  expect(await espnFetchJson(url, { revalidate: 900 })).toEqual({ normal: true });
  await expect(espnFetchJson(url, { revalidate: 900, cache: "none" })).rejects.toThrow("offline");
});
