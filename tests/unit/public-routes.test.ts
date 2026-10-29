import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/calendar/feed", () => ({ buildFeed: vi.fn() }));
vi.mock("@/lib/espn/teams", () => ({ getTeams: vi.fn(), findTeam: vi.fn() }));
vi.mock("@/lib/db/calendars", () => ({ getCalendarRow: vi.fn(), rowToConfig: vi.fn(), touchCalendar: vi.fn() }));
vi.mock("@/lib/schedule-service", async (original) => ({
  ...await original<typeof import("@/lib/schedule-service")>(), loadTeamSchedule: vi.fn(),
}));
vi.mock("@/lib/cache/abuse", async (original) => ({
  ...await original<typeof import("@/lib/cache/abuse")>(), protectPublic: vi.fn(),
}));

import { GET as teams, HEAD as teamsHead } from "@/app/api/teams/route";
import { GET as schedule, HEAD as scheduleHead } from "@/app/api/schedule/route";
import { GET as feed, HEAD as feedHead } from "@/app/calendar/[league]/[...path]/route";
import { buildFeed } from "@/lib/calendar/feed";
import { getTeams, findTeam } from "@/lib/espn/teams";
import { getCalendarRow, rowToConfig, touchCalendar } from "@/lib/db/calendars";
import { loadTeamSchedule } from "@/lib/schedule-service";
import { protectPublic, PublicRateLimitError } from "@/lib/cache/abuse";
import { defaultConfig } from "@/lib/validation/calendar-config";

const savedPath = ["pittsburgh-steelers", "abc123def456.ics"];
const context = (path = savedPath) => ({ params: Promise.resolve({ league: "nfl", path }) });
const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`https://sportscal.site${path}`, init);

beforeEach(() => {
  vi.mocked(protectPublic).mockResolvedValue(undefined);
  vi.mocked(buildFeed).mockResolvedValue({ ics: "BEGIN:VCALENDAR\r\nold config\r\nEND:VCALENDAR", filename: "test.ics", calendarName: "Test", eventCount: 1 });
  vi.mocked(getCalendarRow).mockResolvedValue({ league: "nfl", editTokenHash: "hidden-hash" } as Awaited<ReturnType<typeof getCalendarRow>>);
  vi.mocked(rowToConfig).mockReturnValue(defaultConfig("nfl", { id: "23", slug: "pittsburgh-steelers" }));
  vi.mocked(touchCalendar).mockResolvedValue(undefined);
});
afterEach(() => { vi.resetAllMocks(); });

describe("public route policy", () => {
  it("rejects unknown queries before loading data", async () => {
    expect((await teams(req("/api/teams?league=nfl&unknown=1"))).status).toBe(400);
    expect((await schedule(req("/api/schedule?league=nfl&team=23&unknown=1"))).status).toBe(400);
    expect((await feed(req("/calendar/nfl/pittsburgh-steelers.ics?unknown=1"), context(["pittsburgh-steelers.ics"]))).status).toBe(400);
    expect(protectPublic).not.toHaveBeenCalled();
    expect(getTeams).not.toHaveBeenCalled();
    expect(buildFeed).not.toHaveBeenCalled();
  });

  it("suppresses HEAD bodies even on validation errors", async () => {
    for (const response of [
      await teamsHead(req("/api/teams?unknown=1", { method: "HEAD" })),
      await scheduleHead(req("/api/schedule?unknown=1", { method: "HEAD" })),
      await feedHead(req("/calendar/nfl/team.ics?unknown=1", { method: "HEAD" }), context(["team.ics"])),
    ]) {
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("");
    }
  });

  it("uses the already resolved automatic season", async () => {
    vi.mocked(loadTeamSchedule).mockResolvedValue({ team: { id: "23" }, season: { espnSeason: 2026, displayName: "2026", status: "active" }, games: [], fetchedAt: "2026-10-29T00:00:00Z" } as unknown as Awaited<ReturnType<typeof loadTeamSchedule>>);
    const response = await schedule(req("/api/schedule?league=nfl&team=23"));
    const body = await response.json();
    expect(body.autoSeason).toEqual(body.season);
    expect(loadTeamSchedule).toHaveBeenCalledTimes(1);
  });

  it("re-reads saved config after edits/deletes, keeps it no-store, and never exposes token hashes", async () => {
    const request = req("/calendar/nfl/pittsburgh-steelers/abc123def456.ics");
    const first = await feed(request, context());
    const etag = first.headers.get("etag")!;
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.text()).not.toContain("hidden-hash");
    const unchanged = await feed(req("/calendar/nfl/pittsburgh-steelers/abc123def456.ics", { headers: { "if-none-match": etag } }), context());
    expect(unchanged.status).toBe(304);
    vi.mocked(buildFeed).mockResolvedValue({ ics: "changed calendar", filename: "test.ics", calendarName: "Changed", eventCount: 1 });
    const changed = await feed(req("/calendar/nfl/pittsburgh-steelers/abc123def456.ics", { headers: { "if-none-match": etag } }), context());
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
    vi.mocked(getCalendarRow).mockResolvedValue(undefined);
    const deleted = await feed(req("/calendar/nfl/pittsburgh-steelers/abc123def456.ics", { headers: { "if-none-match": etag } }), context());
    expect(deleted.status).toBe(404);
    expect(getCalendarRow).toHaveBeenCalledTimes(4);
    expect(touchCalendar).toHaveBeenCalledTimes(3);
  });

  it("rejects abusive feed requests before database or ESPN work", async () => {
    vi.mocked(protectPublic).mockRejectedValue(new PublicRateLimitError());
    const response = await feed(req("/calendar/nfl/pittsburgh-steelers/abc123def456.ics"), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(getCalendarRow).not.toHaveBeenCalled();
    expect(findTeam).not.toHaveBeenCalled();
  });
});
