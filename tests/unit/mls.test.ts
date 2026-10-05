import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameTypeOptions } from "@/components/builder/game-type-options";
import { seasonTypeShort } from "@/components/schedule/game-labels";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings, templatesForLeagueChange } from "@/hooks/use-builder-settings";
import { GET as leaguesApi } from "@/app/api/leagues/route";
import { buildCalendarEvents } from "@/lib/calendar/events";
import { generateIcs } from "@/lib/calendar/generator";
import { gameTemplateValues, renderTemplate } from "@/lib/calendar/templates";
import { LEAGUES } from "@/lib/config/leagues";
import * as client from "@/lib/espn/client";
import { normalizeSeason, normalizeSeasonType } from "@/lib/espn/normalize";
import { espnSeasonSchema } from "@/lib/espn/schemas";
import { buildGames, fetchTeamGames } from "@/lib/espn/schedules";
import { decideSeason, fetchSeasonEventCount, seasonPhase } from "@/lib/espn/seasons";
import { buildCatalog, getTeams, findTeam, membershipFromConferenceStandings, membershipFromGroups, parseTeamsResponse } from "@/lib/espn/teams";
import { calendarConfigSchema, defaultConfig, isDefaultConfig } from "@/lib/validation/calendar-config";
import { fixture, gamesFromFixtures } from "../helpers";

const season = { espnSeason: 2026, displayName: "2026", status: "active" as const };
const config = () => defaultConfig("mls", { id: "22529", slug: "san-diego-fc" });
const regularFiles = ["schedule-mls-sandiego-2026-reg.json", "schedule-mls-sandiego-2026-reg-fixtures.json"];
const regular = () => gamesFromFixtures("mls", "22529", season, regularFiles);
const playoffFiles = ["schedule-mls-miami-2025-post-r1.json", "schedule-mls-miami-2025-post-semi.json", "schedule-mls-miami-2025-post-conf-final.json", "schedule-mls-miami-2025-post-final.json", "schedule-mls-miami-2025-post-empty.json"];
const playoffs = () => gamesFromFixtures("mls", "20232", { espnSeason: 2025, displayName: "2025" }, playoffFiles);

afterEach(() => vi.restoreAllMocks());

describe("MLS catalog and configuration", () => {
  it("groups all 30 clubs by conferences lacking isConference, with unique URL-safe slugs", () => {
    expect(membershipFromGroups(fixture("groups-mls.json")).size).toBe(0);
    const catalog = buildCatalog(LEAGUES.mls, parseTeamsResponse(fixture("teams-mls.json")), membershipFromConferenceStandings(fixture("standings-mls.json")));
    expect(catalog).toHaveLength(30);
    expect(catalog.every((t) => t.tier === "primary" && !t.division && /^[a-z0-9-]+$/.test(t.slug))).toBe(true);
    expect(new Set(catalog.map((t) => t.slug)).size).toBe(30);
    for (const name of ["Eastern Conference", "Western Conference"]) expect(catalog.filter((t) => t.conference?.name === name)).toHaveLength(15);
    expect(catalog.find((t) => t.id === "22529")).toMatchObject({ slug: "san-diego-fc", conference: { id: "2", name: "Western Conference" } });
    expect(catalog.some((t) => t.slug === "lafc")).toBe(true);
  });

  it("fetches unfiltered standings as its sole grouping source, and propagates failures", async () => {
    const fetch = vi.spyOn(client, "espnFetchJson").mockImplementation(async (url) => url.includes("standings") ? fixture("standings-mls.json") : fixture("teams-mls.json"));
    expect(await getTeams("mls")).toHaveLength(30);
    const urls = fetch.mock.calls.map(([url]) => new URL(url));
    expect(urls.some((url) => url.pathname.endsWith("/standings") && !url.searchParams.has("group"))).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith("/groups"))).toBe(false);
    fetch.mockImplementation(async (url) => { if (url.includes("standings")) throw new client.EspnError("offline"); return fixture("teams-mls.json"); });
    await expect(getTeams("mls")).rejects.toThrow("offline");
  });

  it("uses soccer defaults and publishes only regular season and playoffs", async () => {
    expect(calendarConfigSchema.parse(config())).toEqual(config());
    expect(isDefaultConfig(config())).toBe(true);
    expect(config().durationMinutes).toBe(120);
    expect(config().templates.title).toBe("{homeTeam} v {awayTeam}");
    const body = await leaguesApi().json();
    expect(body.leagues.find((l: { key: string }) => l.key === "mls")).toMatchObject({ gameTypes: ["regular", "postseason"], postseasonLabel: "Playoffs" });
    expect(LEAGUES.mls.scheduleSeasonTypes).not.toContain(2);
    expect(LEAGUES.mls.scheduleQueries).toHaveLength(32);
  });

  it("uses MLS builder defaults while preserving edited templates across leagues", () => {
    const nfl = defaultSettings("nfl").templates;
    expect(templatesForLeagueChange(nfl, "nfl", "mls").title).toBe("{homeTeam} v {awayTeam}");
    expect(templatesForLeagueChange({ ...nfl, title: "My game: {opponent}" }, "nfl", "mls").title).toBe("My game: {opponent}");
    expect(templatesForLeagueChange(defaultSettings("epl").templates, "epl", "mls").calendarName).toBe("{team} {season} Schedule");
    expect(defaultSettings("mls").templates).toEqual(config().templates);
  });

  it("offers regular season and Playoffs chips with no preseason chip", () => {
    const html = renderToStaticMarkup(createElement(GameTypeOptions, {
      value: config().include, gameTypes: LEAGUES.mls.gameTypes,
      postseasonLabel: LEAGUES.mls.postseasonLabel, onChange: () => undefined,
    }));
    expect(html).toContain("Regular season");
    expect(html).toContain("Playoffs");
    expect(html).not.toContain("Preseason");
    expect(seasonTypeShort(playoffs().at(-1)!)).toBe("Playoffs");
  });

  it("resolves saved-calendar team ids when absent from the current catalog", async () => {
    const rawTeam = parseTeamsResponse(fixture("teams-mls.json")).find((t) => t.id === "22529")!;
    vi.spyOn(client, "espnFetchJson").mockImplementation(async (url) => url.endsWith("/teams/22529") ? { team: rawTeam } : url.includes("standings") ? { children: [] } : { sports: [{ leagues: [{ teams: [] }] }] });
    expect(await findTeam("mls", "22529")).toMatchObject({ id: "22529", slug: "san-diego-fc" });
  });
});

describe("MLS complete schedules and feeds", () => {
  it("merges played results and fixtures, deduplicates, sorts and normalizes soccer fields", () => {
    const games = buildGames([...regularFiles.map(fixture), fixture(regularFiles[0])], { league: LEAGUES.mls, teamId: "22529", season });
    expect(games).toHaveLength(34);
    expect(games.filter((g) => g.status.completed)).toHaveLength(27);
    expect(games.filter((g) => !g.status.completed)).toHaveLength(7);
    expect(games.map((g) => g.startDate)).toEqual(games.map((g) => g.startDate).sort());
    expect(games.every((g) => g.seasonDisplayName === "2026" && !g.week && g.seasonType.normalized === "regular")).toBe(true);
    expect(games.some((g) => g.broadcasts.includes("Apple TV"))).toBe(true);
    const draw = games.find((g) => g.homeTeam.score === "3" && g.awayTeam.score === "3")!;
    expect(draw.homeTeam.winner).toBe(false);
    expect(draw.awayTeam.winner).toBe(false);
    expect(gameTemplateValues(draw).result).toBe("D 3-3");
    const events = buildCalendarEvents(games, config(), "22529");
    const ics = generateIcs(events, { calendarName: "San Diego 2026 Schedule" });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(34);
    expect(ics).toContain("DURATION:PT2H");
    expect(events.every((e) => e.title.includes(" v ") && e.uid.endsWith("-22529@sportscal.site"))).toBe(true);
    const away = games.find((g) => g.selectedTeamHomeAway === "away")!;
    const title = renderTemplate(config().templates.title, gameTemplateValues(away));
    expect(renderTemplate(config().templates.title, gameTemplateValues({ ...away, selectedTeamHomeAway: "home" }))).toBe(title);
  });

  it("drops current-season fixtures when requesting a past season", () => {
    expect(gamesFromFixtures("mls", "22529", { espnSeason: 2025, displayName: "2025" }, ["schedule-mls-sandiego-2026-fixtures-wrongseason.json"])).toEqual([]);
    const games = gamesFromFixtures("mls", "20232", { espnSeason: 2025, displayName: "2025" }, ["schedule-mls-miami-2025-reg.json", "schedule-mls-sandiego-2026-fixtures-wrongseason.json"]);
    expect(games).toHaveLength(34);
    expect(games.every((g) => g.seasonId === 2025 && g.status.completed)).toBe(true);
  });

  it("includes every playoff stage and excludes MLS Cup when playoffs are switched off", () => {
    for (let id = 3; id <= 17; id++) expect(normalizeSeasonType({ id: String(id) }, LEAGUES.mls)).toBe("postseason");
    const games = playoffs();
    expect(games).toHaveLength(6);
    expect(games[0].note).toBe("Game 1");
    expect(games.at(-1)?.seasonType).toMatchObject({ id: "17", normalized: "postseason" });
    const c = defaultConfig("mls", { id: "20232", slug: "inter-miami-cf" });
    expect(buildCalendarEvents(games, c, "20232").every((e) => e.included)).toBe(true);
    c.include.postseason = false;
    expect(buildCalendarEvents(games, c, "20232").every((e) => !e.included && e.excludedBy === "seasonType")).toBe(true);
  });

  it("labels level-score soccer wins and losses as penalties (synthetic winner flags)", () => {
    const base = regular()[0];
    const game = { ...base, selectedTeamHomeAway: "home" as const, status: { ...base.status, completed: true }, homeTeam: { ...base.homeTeam, score: "1", winner: true }, awayTeam: { ...base.awayTeam, score: "1", winner: false } };
    expect(gameTemplateValues(game).result).toBe("W 1-1 (pens)");
    expect(gameTemplateValues({ ...game, selectedTeamHomeAway: "away" }).result).toBe("L 1-1 (pens)");
  });
});

describe("MLS schedule request failure boundaries", () => {
  it("tolerates optional playoff failures but loads both required regular responses", async () => {
    const fetch = vi.spyOn(client, "espnFetchJson").mockImplementation(async (url) => {
      const params = new URL(url).searchParams;
      if (params.get("seasontype") !== "1") throw new client.EspnError("optional outage");
      return fixture(params.get("fixture") === "true" ? regularFiles[1] : regularFiles[0]);
    });
    expect(await fetchTeamGames("mls", "22529", season)).toHaveLength(34);
    expect(fetch).toHaveBeenCalledTimes(32);
    expect(fetch.mock.calls.every(([url]) => new URL(url).searchParams.get("seasontype") !== "2")).toBe(true);
  });

  it.each([false, true])("propagates a required regular request failure (fixture=%s)", async (fixtureQuery) => {
    vi.spyOn(client, "espnFetchJson").mockImplementation(async (url) => {
      const params = new URL(url).searchParams;
      if (params.get("seasontype") === "1" && (params.get("fixture") === "true") === fixtureQuery) throw new client.EspnError("required outage");
      return { events: [] };
    });
    await expect(fetchTeamGames("mls", "22529", season)).rejects.toThrow("required outage");
  });

  it("skips every fixture query for completed seasons", async () => {
    const fetch = vi.spyOn(client, "espnFetchJson").mockResolvedValue({ events: [] });
    await fetchTeamGames("mls", "20232", { espnSeason: 2025, displayName: "2025", status: "completed" });
    expect(fetch).toHaveBeenCalledTimes(16);
    expect(fetch.mock.calls.every(([url]) => !new URL(url).searchParams.has("fixture"))).toBe(true);
  });

  it("keeps other leagues' required-query behavior unchanged", async () => {
    vi.spyOn(client, "espnFetchJson").mockRejectedValue(new client.EspnError("outage"));
    await expect(fetchTeamGames("nba", "25", season)).rejects.toThrow("outage");
  });
});

describe("MLS season resolution", () => {
  const meta = normalizeSeason(espnSeasonSchema.parse(fixture("season-mls-2026.json")), LEAGUES.mls);
  it("uses the short calendar-year label and includes MLS Cup in the active window", () => {
    expect(meta.displayName).toBe("2026");
    expect(meta.types.find((t) => t.id === "17")?.normalized).toBe("postseason");
    expect(seasonPhase(meta, new Date("2026-10-02T12:00:00Z"))).toBe("active");
    expect(decideSeason({ current: meta, next: null }, new Date("2027-01-02T12:00:00Z"))).toMatchObject({ espnSeason: 2026, status: "completed", pendingNextSeason: { espnSeason: 2027 } });
  });
  it("counts regular type 1 rather than the All-Star type", async () => {
    const fetch = vi.spyOn(client, "espnFetchJson").mockResolvedValue({ count: 511 });
    expect(await fetchSeasonEventCount(LEAGUES.mls, 2026)).toBe(511);
    expect(fetch.mock.calls[0][0]).toContain("/types/1/events");
  });
});
