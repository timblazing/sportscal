import ICAL from "ical.js";
import { NextRequest } from "next/server";

import { GET as getFeed } from "@/app/calendar/[league]/[...path]/route";
import { POST as download } from "@/app/api/download/route";
import { getCalendarRow } from "@/lib/db/calendars";
import type { CalendarConfigRow } from "@/lib/db/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCalendarEvents } from "@/lib/calendar/events";
import { buildFeed } from "@/lib/calendar/feed";
import { generateIcs } from "@/lib/calendar/generator";
import { gameTemplateValues, renderTemplate } from "@/lib/calendar/templates";
import { LEAGUES } from "@/lib/config/leagues";
import { normalizeSeason } from "@/lib/espn/normalize";
import { espnSeasonSchema } from "@/lib/espn/schemas";
import { decideSeason, resolveLeagueSeason, seasonPhase } from "@/lib/espn/seasons";
import { buildCatalog, membershipFromGroups, membershipFromStandings, parseTeamsResponse } from "@/lib/espn/teams";
import { defaultConfig } from "@/lib/validation/calendar-config";
import { fixture, gamesFromFixtures } from "../helpers";

vi.mock("@/lib/db/calendars", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/calendars")>(),
  getCalendarRow: vi.fn(),
  touchCalendar: vi.fn(async () => undefined),
}));

const files = ["pre", "reg", "post"].map((type) => `schedule-wnba-dream-2026-${type}.json`);
const games = gamesFromFixtures("wnba", "20", { espnSeason: 2026, displayName: "2026" }, files);
const config = defaultConfig("wnba", { id: "20", slug: "atlanta-dream" });
const season = normalizeSeason(espnSeasonSchema.parse(fixture("season-wnba-2026.json")), LEAGUES.wnba);

afterEach(() => vi.unstubAllGlobals());

describe("WNBA catalog and schedules", () => {
  it("uses standings to show all 15 teams across two conferences", () => {
    expect(LEAGUES.wnba.teamGrouping).toEqual({ kind: "standings", defaultGroupIds: ["3"], extendedGroupIds: [] });
    expect(membershipFromGroups(fixture("groups-wnba.json")).size).toBe(0);
    const membership = membershipFromStandings(fixture("standings-wnba.json"), "primary");
    expect(membership.size).toBe(15);
    const teams = buildCatalog(LEAGUES.wnba, parseTeamsResponse(fixture("teams-wnba.json")), membership);
    expect(teams).toHaveLength(15);
    expect(teams.every((team) => team.tier === "primary" && team.logo && !team.division && team.isFbs === undefined)).toBe(true);
    expect(teams.filter((team) => team.conference?.name === "Eastern Conference")).toHaveLength(7);
    expect(teams.filter((team) => team.conference?.name === "Western Conference")).toHaveLength(8);
    for (const slug of ["golden-state-valkyries", "toronto-tempo", "portland-fire"])
      expect(teams.find((team) => team.slug === slug)).toBeDefined();
  });

  it("merges preseason, regular season and postseason with single-year labels", () => {
    expect(LEAGUES.wnba.scheduleSeasonTypes).toEqual([1, 2, 3]);
    expect(games).toHaveLength(53);
    expect(games.filter((game) => game.seasonType.normalized === "preseason")).toHaveLength(2);
    expect(games.filter((game) => game.seasonType.normalized === "regular")).toHaveLength(44);
    expect(games.filter((game) => game.seasonType.normalized === "postseason")).toHaveLength(7);
    expect(games.every((game) => game.week === undefined && game.seasonId === 2026 && game.seasonDisplayName === "2026")).toBe(true);
  });

  it("retains Cup group games and the championship in the regular season", () => {
    const cupGames = games.filter((game) => game.note === "WNBA Commissioner's Cup");
    expect(cupGames).toHaveLength(6);
    expect(cupGames.every((game) => game.seasonType.normalized === "regular")).toBe(true);
    const final = gamesFromFixtures("wnba", "8", { espnSeason: 2025, displayName: "2025" }, ["schedule-wnba-lynx-2025-reg.json"]);
    expect(final).toHaveLength(1);
    expect(final[0].seasonType.normalized).toBe("regular");
    expect(final[0].note).toBe("WNBA Commissioner's Cup Championship");
  });

  it("keeps if-necessary games on their Eastern calendar dates", () => {
    const tbd = games.filter((game) => game.timeTBD);
    expect(tbd.map((game) => game.localDate)).toEqual(["2026-10-11", "2026-10-14"]);
    expect(tbd.every((game) => game.note?.includes("If Necessary"))).toBe(true);
  });

  it("returns an empty schedule when next-season requestedSeason is absent", () => {
    expect(gamesFromFixtures("wnba", "20", { espnSeason: 2027, displayName: "2027" }, ["schedule-wnba-dream-2027-reg-empty.json"])).toEqual([]);
  });
});

describe("WNBA season resolution", () => {
  it("ignores the offseason window and stays pending until next-season games exist", () => {
    expect(season.types.map((type) => type.normalized)).toEqual(["preseason", "regular", "postseason", "other"]);
    expect(seasonPhase(season, new Date("2026-10-02T12:00Z"))).toBe("active");
    expect(seasonPhase(season, new Date("2026-11-02T12:00Z"))).toBe("completed");
    expect(decideSeason({ current: season, next: null, nextEventCount: 0 }, new Date("2026-11-02T12:00Z"))).toEqual({
      espnSeason: 2026, displayName: "2026", status: "completed", pendingNextSeason: { espnSeason: 2027, displayName: undefined },
    });
  });

  it("resolves the missing-next-season ESPN error body through the adapter", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/season")) return Response.json(fixture("season-wnba-2026.json"));
      if (url.endsWith("/seasons/2027")) return Response.json(fixture("season-wnba-2027.json"));
      throw new Error(`Unexpected ESPN request: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    expect(await resolveLeagueSeason(LEAGUES.wnba, new Date("2026-10-02T12:00Z"))).toMatchObject({ espnSeason: 2026, displayName: "2026", status: "active" });
    expect(await resolveLeagueSeason(LEAGUES.wnba, new Date("2026-11-02T12:00Z"))).toMatchObject({ status: "completed", pendingNextSeason: { espnSeason: 2027 } });
  });
});

describe("WNBA preview and calendars", () => {
  it("renders the league template and generates two-hour timed events", () => {
    expect(renderTemplate("{league}", gameTemplateValues(games[0]))).toBe("WNBA");
    const events = buildCalendarEvents(games, config, "20");
    const calendar = new ICAL.Component(ICAL.parse(generateIcs(events, { calendarName: "Dream 2026 Schedule" })));
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe("Dream 2026 Schedule");
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(53);
    const timed = calendar.getAllSubcomponents("vevent").find((event) => event.hasProperty("duration"))!;
    const parsed = new ICAL.Event(timed);
    expect(parsed.endDate.toUnixTime() - parsed.startDate.toUnixTime()).toBe(2 * 60 * 60);
    const tbd = calendar.getAllSubcomponents("vevent").find((event) => event.getFirstPropertyValue("uid") === "espn-401918301-20@sportscal.site")!;
    expect(String(tbd.getFirstPropertyValue("dtstart"))).toBe("2026-10-11");
    expect(String(tbd.getFirstPropertyValue("dtend"))).toBe("2026-10-12");
    expect((tbd.getFirstPropertyValue("dtstart") as ICAL.Time).isDate).toBe(true);
  });

  it.each([
    ["preseason", "preseason", 2], ["regularSeason", "regular", 44], ["postseason", "postseason", 7],
  ] as const)("uses the %s chip for both preview and ICS", (chip, normalized, count) => {
    const filtered = { ...config, include: { preseason: false, regularSeason: false, postseason: false, [chip]: true } };
    const events = buildCalendarEvents(games, filtered, "20");
    expect(events.filter((event) => event.included)).toHaveLength(count);
    expect(events.filter((event) => event.included).every((event) => event.game.seasonType.normalized === normalized)).toBe(true);
    const calendar = new ICAL.Component(ICAL.parse(generateIcs(events, { calendarName: "WNBA" })));
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(count);
  });

  it("builds canonical and custom feeds through the real ESPN and template pipeline", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      let name: string;
      if (url.pathname.endsWith("/teams")) name = "teams-wnba.json";
      else if (url.pathname.endsWith("/standings")) {
        expect(url.searchParams.get("group")).toBe("3");
        name = "standings-wnba.json";
      } else if (url.pathname.endsWith("/season")) name = "season-wnba-2026.json";
      else if (url.pathname.endsWith("/seasons/2027")) name = "season-wnba-2027.json";
      else if (url.pathname.endsWith("/teams/20/schedule")) {
        const type = { "1": "pre", "2": "reg", "3": "post" }[url.searchParams.get("seasontype")!];
        if (!type) throw new Error(`Unexpected type: ${url}`);
        name = `schedule-wnba-dream-2026-${type}.json`;
      } else throw new Error(`Unexpected ESPN request: ${url}`);
      return Response.json(fixture(name));
    }));
    const feed = await buildFeed(config, "20");
    expect(feed.filename).toBe("atlanta-dream-2026.ics");
    expect(feed.calendarName).toBe("Dream 2026 Schedule");
    expect(feed.eventCount).toBe(53);
    expect(feed.ics).toContain("UID:espn-401918301-20@sportscal.site");
    const custom = await buildFeed({ ...config, templates: { ...config.templates, title: "{league}: {team} {opponent}", description: "{note}" } }, "k3j9x0a1b2c4");
    expect(custom.ics).toContain("SUMMARY:WNBA:");
    expect(custom.ics).toContain("UID:espn-401918301-k3j9x0a1b2c4@sportscal.site");
    expect(custom.ics).toContain("DESCRIPTION:WNBA Semifinals - Game 4 If Necessary");

    const request = new NextRequest("http://localhost/calendar/wnba/atlanta-dream.ics");
    const canonical = await getFeed(request, { params: Promise.resolve({ league: "wnba", path: ["atlanta-dream.ics"] }) });
    expect(canonical.status).toBe(200);
    expect(canonical.headers.get("content-type")).toContain("text/calendar");
    expect(await canonical.text()).toContain("UID:espn-401918301-20@sportscal.site");

    const row: CalendarConfigRow = {
      id: "00000000-0000-0000-0000-000000000001", publicId: "k3j9x0a1b2c4", editTokenHash: "unused",
      league: "wnba", teamId: "20", teamSlug: "atlanta-dream", seasonMode: "auto", seasonOverride: null,
      includePreseason: false, includeRegularSeason: false, includePostseason: true,
      calendarNameTemplate: "{team} {league} {season}", titleTemplate: "{league}: {opponent}",
      descriptionTemplate: "{note}", locationTemplate: "{venue}", durationMinutes: 120,
      busyStatus: "free", includeEspnUrl: false, overridesJson: {},
      createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: null,
    };
    vi.mocked(getCalendarRow).mockResolvedValue(row);
    const saved = await getFeed(request, { params: Promise.resolve({ league: "wnba", path: ["atlanta-dream", "k3j9x0a1b2c4.ics"] }) });
    expect(saved.status).toBe(200);
    const savedIcs = new ICAL.Component(ICAL.parse(await saved.text()));
    expect(savedIcs.getFirstPropertyValue("x-wr-calname")).toBe("Dream WNBA 2026");
    expect(savedIcs.getAllSubcomponents("vevent")).toHaveLength(7);
    expect(String(savedIcs.getAllSubcomponents("vevent")[0].getFirstPropertyValue("uid"))).toContain("-k3j9x0a1b2c4@");

    for (const league of ["unknown"]) {
      const response = await getFeed(request, { params: Promise.resolve({ league, path: ["atlanta-dream.ics"] }) });
      expect(response.status).toBe(404);
    }
    const wrongLeague = await getFeed(request, { params: Promise.resolve({ league: "nba", path: ["atlanta-dream", "k3j9x0a1b2c4.ics"] }) });
    expect(wrongLeague.status).toBe(404);
    const unknownTeam = await getFeed(request, { params: Promise.resolve({ league: "wnba", path: ["unknown-team.ics"] }) });
    expect(unknownTeam.status).toBe(404);

    const snapshot = await download(new Request("http://localhost/api/download", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }),
    }));
    expect(snapshot.status).toBe(200);
    expect(snapshot.headers.get("x-sportscal-event-count")).toBe("53");
    expect(await snapshot.text()).toContain("X-WR-CALNAME:Dream 2026 Schedule");
  });
});
