import { NextRequest } from "next/server";
import ICAL from "ical.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixture } from "../helpers";
import { defaultConfig } from "@/lib/validation/calendar-config";
import { GET as teamsRoute } from "@/app/api/teams/route";
import { GET as feedRoute } from "@/app/calendar/[league]/[...path]/route";
import { POST as downloadRoute } from "@/app/api/download/route";
import { POST as saveRoute } from "@/app/api/calendars/route";
import { createCalendar, getCalendarRow } from "@/lib/db/calendars";

// Database persistence is exercised separately in the browser acceptance checklist.
vi.mock("@/lib/db/calendars", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/calendars")>(),
  createCalendar: vi.fn().mockResolvedValue({ publicId: "abc123def456", editToken: "test-token" }),
  getCalendarRow: vi.fn(),
  touchCalendar: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

function request(config: object) {
  return new Request("http://localhost/api/calendars", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }),
  });
}
function events(ics: string) {
  return new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    let file: string;
    if (url.pathname.endsWith("/standings")) {
      expect(url.searchParams.get("group")).toBe("50");
      file = "standings-ncaab-d1.json";
    } else if (url.pathname.endsWith("/teams")) {
      expect(url.searchParams.get("limit")).toBe("1000");
      file = "teams-ncaab.json";
    } else if (url.pathname.endsWith("/season")) {
      file = "season-ncaab-2027.json";
    } else if (url.pathname.includes("/schedule")) {
      const year = url.searchParams.get("season");
      const type = url.searchParams.get("seasontype");
      expect(["2", "3"]).toContain(type);
      file = `schedule-ncaab-duke-${year}-${type === "2" ? "reg" : year === "2027" ? "post-empty" : "post"}.json`;
    } else if (/\/seasons\/202[67]$/.test(url.pathname)) {
      file = `season-ncaab-${url.pathname.split("/").at(-1)}.json`;
    } else {
      throw new Error(`Unexpected ESPN request: ${url}`);
    }
    return Response.json(fixture(file));
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("NCAAB API and subscription pipeline", () => {
  it("returns backfilled D-I teams by default and non-D-I teams with all=1", async () => {
    const primary = await (await teamsRoute(new NextRequest("http://localhost/api/teams?league=ncaab"))).json();
    expect(primary.teams.some((t: { id: string }) => t.id === "2511")).toBe(true);
    expect(primary.teams.some((t: { id: string }) => t.id === "2697")).toBe(false);
    const all = await (await teamsRoute(new NextRequest("http://localhost/api/teams?league=ncaab&all=1"))).json();
    expect(all.teams.some((t: { id: string }) => t.id === "2697")).toBe(true);
  });

  it("serves canonical feeds with stable UIDs and matches the snapshot download", async () => {
    const req = new NextRequest("http://localhost/calendar/ncaab/duke-blue-devils.ics");
    const ctx = { params: Promise.resolve({ league: "ncaab", path: ["duke-blue-devils.ics"] }) };
    const response = await feedRoute(req, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    const first = events(await response.text());
    const second = events(await (await feedRoute(req, ctx)).text());
    expect(first).toHaveLength(33);
    expect(first.filter((e) => (e.getFirstPropertyValue("dtstart") as ICAL.Time).isDate)).toHaveLength(26);
    const uids = (es: ICAL.Component[]) => es.map((e) => e.getFirstPropertyValue("uid"));
    expect(uids(first)).toEqual(uids(second));
    const download = await downloadRoute(request(defaultConfig("ncaab", { id: "150", slug: "duke-blue-devils" })));
    expect(download.status).toBe(200);
    expect(uids(events(await download.text()))).toEqual(uids(first));
  });

  it("accepts custom NCAAB calendars and canonicalizes their stored team slug", async () => {
    const config = defaultConfig("ncaab", { id: "150", slug: "old-slug" });
    config.templates.title = "Basketball: {opponent}";
    const response = await saveRoute(request(config));
    expect(response.status).toBe(201);
    expect(createCalendar).toHaveBeenCalledWith({ ...config, teamSlug: "duke-blue-devils" });
    expect(await response.json()).toMatchObject({
      feedPath: "/calendar/ncaab/duke-blue-devils/abc123def456.ics",
      config: { league: "ncaab", durationMinutes: 120 },
    });
  });

  it("rehydrates a saved NCAAB row and serves its custom feed with public-id UIDs", async () => {
    const config = defaultConfig("ncaab", { id: "150", slug: "duke-blue-devils" });
    vi.mocked(getCalendarRow).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001", publicId: "abc123def456", editTokenHash: "test-hash",
      league: config.league, teamId: config.teamId, teamSlug: config.teamSlug,
      seasonMode: "auto", seasonOverride: null,
      includePreseason: true, includeRegularSeason: true, includePostseason: true,
      calendarNameTemplate: config.templates.calendarName, titleTemplate: "Hoops: {opponent}",
      descriptionTemplate: "{note}", locationTemplate: config.templates.location,
      durationMinutes: config.durationMinutes, busyStatus: "free", includeEspnUrl: false, overridesJson: {},
      createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: null,
    });
    const response = await feedRoute(new NextRequest("http://localhost/calendar/ncaab/duke-blue-devils/abc123def456.ics"), {
      params: Promise.resolve({ league: "ncaab", path: ["duke-blue-devils", "abc123def456.ics"] }),
    });
    expect(response.status).toBe(200);
    const saved = events(await response.text());
    expect(saved).toHaveLength(33);
    expect(saved.every((e) => String(e.getFirstPropertyValue("uid")).endsWith("-abc123def456@sportscal.site"))).toBe(true);
    expect(saved.every((e) => String(e.getFirstPropertyValue("summary")).startsWith("Hoops: "))).toBe(true);
  });

  it("downloads a manual past season with both ACC and NCAA tournament games", async () => {
    const config = { ...defaultConfig("ncaab", { id: "150", slug: "duke-blue-devils" }), seasonMode: "manual", seasonOverride: 2026 };
    const response = await downloadRoute(request(config));
    expect(response.status).toBe(200);
    expect(events(await response.text())).toHaveLength(9);
  });
});
