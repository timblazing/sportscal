import { describe, expect, it } from "vitest";

import { LEAGUES } from "@/lib/config/leagues";
import { normalizeBroadcasts, normalizeSeasonType, normalizeVenue } from "@/lib/espn/normalize";
import { buildGames } from "@/lib/espn/schedules";
import {
  buildCatalog,
  membershipFromGroups,
  membershipFromStandings,
  parseTeamsResponse,
} from "@/lib/espn/teams";
import { fixture, soonersGames, steelersGames, thunderPlayoffGames } from "../helpers";

describe("season type normalization", () => {
  const nba = LEAGUES.nba;
  it("prefers ESPN abbreviations and names", () => {
    expect(normalizeSeasonType({ id: "1", abbreviation: "pre", name: "Preseason" }, nba)).toBe("preseason");
    expect(normalizeSeasonType({ id: "2", abbreviation: "reg", name: "Regular Season" }, nba)).toBe("regular");
    expect(normalizeSeasonType({ id: "3", abbreviation: "post", name: "Postseason" }, nba)).toBe("postseason");
    expect(normalizeSeasonType({ id: "5", name: "Play-In Season" }, nba)).toBe("postseason");
    expect(normalizeSeasonType({ id: "4", abbreviation: "off", name: "Off Season" }, nba)).toBe("other");
  });
  it("falls back to the league's id table", () => {
    expect(normalizeSeasonType({ id: "3" }, LEAGUES.nfl)).toBe("postseason");
    expect(normalizeSeasonType({ id: "99" }, LEAGUES.nfl)).toBe("other");
  });
});

describe("optional fields", () => {
  it("never fails on missing broadcasts or venues", () => {
    expect(normalizeBroadcasts(undefined)).toEqual([]);
    expect(normalizeBroadcasts([{ media: { shortName: "CBS" } }, { names: ["CBS", "Paramount+"] }])).toEqual([
      "CBS",
      "Paramount+",
    ]);
    expect(normalizeVenue(undefined)).toBeUndefined();
    expect(normalizeVenue({})).toBeUndefined();
  });

  it("skips malformed events instead of failing the schedule", () => {
    const games = buildGames(
      [{ requestedSeason: { year: 2026 }, events: [{ nope: true }, { id: "1", competitions: [] }] }],
      { league: LEAGUES.nfl, teamId: "23", season: { espnSeason: 2026, displayName: "2026" } },
    );
    expect(games).toEqual([]);
  });

  it("discards responses for a different season than requested", () => {
    const games = buildGames([fixture("schedule-ncaaf-sooners-2025-post.json")], {
      league: LEAGUES.ncaaf,
      teamId: "201",
      season: { espnSeason: 2026, displayName: "2026" },
    });
    expect(games).toEqual([]);
  });
});

describe("Pittsburgh Steelers schedule", () => {
  const games = steelersGames();
  it("merges season types and sorts by date", () => {
    expect(games).toHaveLength(20);
    expect(games.filter((g) => g.seasonType.normalized === "preseason")).toHaveLength(3);
    expect(games.filter((g) => g.seasonType.normalized === "regular")).toHaveLength(17);
    const times = games.map((g) => Date.parse(g.startDate));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("normalizes an away game", () => {
    const g = games.find((x) => x.id === "401873002")!;
    expect(g.startDate).toBe("2026-10-18T17:00:00.000Z");
    expect(g.selectedTeamHomeAway).toBe("away");
    expect(g.homeTeam.displayName).toBe("Tampa Bay Buccaneers");
    expect(g.venue).toEqual({ name: "Raymond James Stadium", city: "Tampa", state: "FL", country: "USA" });
    expect(g.week).toEqual({ number: 6, label: "Week 6" });
    expect(g.timeTBD).toBe(false);
    expect(g.espnUrl).toMatch(/^https:\/\/www\.espn\.com\/nfl\/game\//);
  });

  it("flags ESPN's TBD placeholder times", () => {
    const tbd = games.filter((g) => g.timeTBD);
    expect(tbd.length).toBeGreaterThan(0);
    const week18 = tbd.find((g) => g.startDate === "2027-01-10T05:00:00.000Z")!;
    expect(week18.localDate).toBe("2027-01-10");
  });
});

describe("Oklahoma City Thunder postseason", () => {
  it("normalizes playoff games with notes and scores", () => {
    const games = thunderPlayoffGames();
    expect(games).toHaveLength(15);
    expect(games.every((g) => g.seasonType.normalized === "postseason")).toBe(true);
    const last = games.at(-1)!;
    expect(last.seasonDisplayName).toBe("2025-26");
    expect(last.status.completed).toBe(true);
    expect(last.broadcasts).toEqual(["NBC", "Peacock"]);
  });
});

describe("Oklahoma Sooners schedule", () => {
  it("handles TBD kickoffs and neutral sites", () => {
    const games = soonersGames();
    expect(games).toHaveLength(12);
    const kentucky = games.find((g) => g.id === "401856722")!;
    expect(kentucky.timeTBD).toBe(true);
    // 04:00Z during EDT is midnight Eastern: the game date is Oct 17, not Oct 16.
    expect(kentucky.localDate).toBe("2026-10-17");
    const texas = games.find((g) => g.id === "401856717")!;
    expect(texas.neutralSite).toBe(true);
  });
});

describe("team catalogs", () => {
  it("groups NFL teams by conference and division", () => {
    const catalog = buildCatalog(
      LEAGUES.nfl,
      parseTeamsResponse(fixture("teams-nfl.json")),
      membershipFromGroups(fixture("groups-nfl.json")),
    );
    expect(catalog).toHaveLength(32);
    const steelers = catalog.find((t) => t.slug === "pittsburgh-steelers")!;
    expect(steelers.conference?.shortName).toBe("AFC");
    expect(steelers.division?.name).toBe("AFC North");
    expect(steelers.shortName).toBe("Steelers");
  });

  it("groups NBA teams", () => {
    const catalog = buildCatalog(
      LEAGUES.nba,
      parseTeamsResponse(fixture("teams-nba.json")),
      membershipFromGroups(fixture("groups-nba.json")),
    );
    const okc = catalog.find((t) => t.slug === "oklahoma-city-thunder")!;
    expect(okc.conference?.name).toBe("Western Conference");
    expect(okc.division?.name).toBe("Northwest");
  });

  it("defaults NCAAF to FBS teams grouped by conference", () => {
    const membership = membershipFromStandings(fixture("standings-ncaaf-fbs.json"), "primary");
    membershipFromStandings(fixture("standings-ncaaf-fcs.json"), "secondary", membership);
    const catalog = buildCatalog(LEAGUES.ncaaf, parseTeamsResponse(fixture("teams-ncaaf.json")), membership);

    const fbs = catalog.filter((t) => t.tier === "primary");
    expect(fbs.length).toBeGreaterThan(120);
    expect(fbs.every((t) => t.isFbs)).toBe(true);
    const ou = catalog.find((t) => t.slug === "oklahoma-sooners")!;
    expect(ou.conference?.name).toBe("SEC");
    expect(ou.tier).toBe("primary");

    const conferences = new Set(fbs.map((t) => t.conference?.name));
    for (const name of ["SEC", "Big Ten", "Big 12", "ACC", "Independents"]) expect(conferences).toContain(name);

    expect(catalog.some((t) => t.tier === "secondary" && t.subdivision === "FCS" && t.isFbs === false)).toBe(true);
    expect(catalog.some((t) => t.tier === "other")).toBe(true);
  });
});
