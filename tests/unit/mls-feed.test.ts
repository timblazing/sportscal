import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db/calendars", () => ({ getCalendarRow: vi.fn(), rowToConfig: vi.fn(), touchCalendar: vi.fn().mockResolvedValue(undefined) }));

import { GET } from "@/app/calendar/[league]/[...path]/route";
import * as calendars from "@/lib/db/calendars";
import * as client from "@/lib/espn/client";
import { parseTeamsResponse } from "@/lib/espn/teams";
import { defaultConfig } from "@/lib/validation/calendar-config";
import { fixture } from "../helpers";

const request = new Request("http://localhost/calendar/mls/san-diego-fc.ics") as NextRequest;
const route = (path = ["san-diego-fc.ics"]) => GET(request, { params: Promise.resolve({ league: "mls", path }) });

function mockEspn({ missingTeam = false, regularFailure = false } = {}) {
  const team = parseTeamsResponse(fixture("teams-mls.json")).find((t) => t.id === "22529");
  return vi.spyOn(client, "espnFetchJson").mockImplementation(async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/teams/22529")) return { team };
    if (u.pathname.endsWith("/teams")) return missingTeam ? { sports: [{ leagues: [{ teams: [] }] }] } : fixture("teams-mls.json");
    if (u.pathname.endsWith("/standings")) return fixture("standings-mls.json");
    if (u.pathname.endsWith("/season")) return fixture("season-mls-2026.json");
    if (u.pathname.endsWith("/schedule")) {
      if (u.searchParams.get("seasontype") !== "1") throw new client.EspnError("optional playoff outage");
      if (regularFailure) throw new client.EspnError("required regular outage");
      return fixture(u.searchParams.has("fixture") ? "schedule-mls-sandiego-2026-reg-fixtures.json" : "schedule-mls-sandiego-2026-reg.json");
    }
    throw new Error(`Unexpected test URL: ${url}`);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("MLS public feed integration", () => {
  it("serves all 34 canonical events even when optional playoff requests fail", async () => {
    mockEspn();
    const response = await route();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    const ics = await response.text();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(34);
    expect(ics).toContain("X-WR-CALNAME:San Diego 2026 Schedule");
    expect(ics).toContain("DURATION:PT2H");
    expect(ics.match(/UID:espn-\d+-22529@sportscal.site/g)).toHaveLength(34);
  });

  it("returns 503 and retry-after for a required regular-season outage", async () => {
    mockEspn({ regularFailure: true });
    const response = await route();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
  });

  it("serves a saved calendar by stored team ID when the club is absent from the catalog", async () => {
    const fetch = mockEspn({ missingTeam: true });
    const publicId = "abc123def456";
    vi.mocked(calendars.getCalendarRow).mockResolvedValue({ league: "mls" } as Awaited<ReturnType<typeof calendars.getCalendarRow>>);
    vi.mocked(calendars.rowToConfig).mockReturnValue(defaultConfig("mls", { id: "22529", slug: "old-club-name" }));
    const response = await route(["old-club-name", `${publicId}.ics`]);
    expect(response.status).toBe(200);
    const ics = await response.text();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(34);
    expect(ics.match(/UID:espn-\d+-abc123def456@sportscal.site/g)).toHaveLength(34);
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/teams/22529"))).toBe(true);
  });
});
