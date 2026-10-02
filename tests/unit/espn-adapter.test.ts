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
import {
  fixture,
  gamesFromFixtures,
  nhlPenguinsGames,
  nhlPenguinsUpcomingGames,
  soonersGames,
  steelersGames,
  thunderPlayoffGames,
} from "../helpers";

describe("season type normalization", () => {
  const nba = LEAGUES.nba;
  it("prefers ESPN abbreviations and names", () => {
    expect(normalizeSeasonType({ id: "1", abbreviation: "pre", name: "Preseason" }, nba)).toBe("preseason");
    expect(normalizeSeasonType({ id: "2", abbreviation: "reg", name: "Regular Season" }, nba)).toBe("regular");
    expect(normalizeSeasonType({ id: "3", abbreviation: "post", name: "Postseason" }, nba)).toBe("postseason");
    expect(normalizeSeasonType({ id: "5", name: "Play-In Season" }, nba)).toBe("postseason");
    expect(normalizeSeasonType({ id: "4", abbreviation: "off", name: "Off Season" }, nba)).toBe("other");
  });
  it("maps NHL season types with and without abbreviations", () => {
    const nhl = LEAGUES.nhl;
    expect(normalizeSeasonType({ id: "1", abbreviation: "pre", name: "Preseason" }, nhl)).toBe("preseason");
    expect(normalizeSeasonType({ id: "2", abbreviation: "reg", name: "Regular Season" }, nhl)).toBe("regular");
    expect(normalizeSeasonType({ id: "3", abbreviation: "post", name: "Postseason" }, nhl)).toBe("postseason");
    expect(normalizeSeasonType({ id: "4", abbreviation: "off", name: "Off Season" }, nhl)).toBe("other");
    expect(["1", "2", "3", "4"].map((id) => normalizeSeasonType({ id }, nhl))).toEqual([
      "preseason",
      "regular",
      "postseason",
      "other",
    ]);
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

  it("groups NHL teams by conference and division (group nodes have no ids)", () => {
    const membership = membershipFromGroups(fixture("groups-nhl.json"));
    const catalog = buildCatalog(LEAGUES.nhl, parseTeamsResponse(fixture("teams-nhl.json")), membership);
    expect(catalog).toHaveLength(32);
    expect(catalog.every((t) => t.tier === "primary" && t.isFbs === undefined)).toBe(true);
    expect(catalog.map((t) => t.displayName)).toEqual([...catalog.map((t) => t.displayName)].sort((a, b) => a.localeCompare(b)));
    expect(new Set(catalog.map((t) => t.conference?.name))).toEqual(new Set(["Eastern Conference", "Western Conference"]));
    expect(catalog.every((t) => t.conference?.id === undefined && t.division?.id === undefined)).toBe(true);

    const divisions = new Map<string, number>();
    for (const t of catalog) divisions.set(t.division!.name, (divisions.get(t.division!.name) ?? 0) + 1);
    expect(Object.fromEntries(divisions)).toEqual({
      "Atlantic Division": 8,
      "Metropolitan Division": 8,
      "Central Division": 8,
      "Pacific Division": 8,
    });

    const pit = catalog.find((t) => t.slug === "pittsburgh-penguins")!;
    expect(pit.id).toBe("16");
    expect(pit.division?.name).toBe("Metropolitan Division");
    const utah = catalog.find((t) => t.id === "129764")!;
    expect(utah.slug).toBe("utah-mammoth");
    expect(utah.displayName).toBe("Utah Mammoth");
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

describe("Pittsburgh Penguins (NHL)", () => {
  it("loads the 84-game 2026-27 season with an empty postseason", () => {
    const games = nhlPenguinsUpcomingGames();
    expect(games.filter((g) => g.seasonType.normalized === "preseason")).toHaveLength(4);
    expect(games.filter((g) => g.seasonType.normalized === "regular")).toHaveLength(84);
    expect(games.filter((g) => g.seasonType.normalized === "postseason")).toHaveLength(0);
    expect(games.every((g) => g.seasonDisplayName === "2026-27" && g.week === undefined)).toBe(true);
    // ESPN omits `broadcasts` for some games.
    expect(games.some((g) => g.broadcasts.length === 0)).toBe(true);
  });

  it("returns no games for an unpublished postseason", () => {
    const games = gamesFromFixtures("nhl", "16", { espnSeason: 2027, displayName: "2026-27" }, [
      "schedule-nhl-penguins-2027-post-empty.json",
    ]);
    expect(games).toEqual([]);
  });

  it("discards a response for a different season", () => {
    const games = gamesFromFixtures("nhl", "16", { espnSeason: 2027, displayName: "2026-27" }, [
      "schedule-nhl-penguins-2026-reg.json",
    ]);
    expect(games).toEqual([]);
  });

  it("normalizes Global Series games as neutral-site international games", () => {
    const stockholm = nhlPenguinsGames().filter((g) => g.note === "NHL Global Series");
    expect(stockholm.map((g) => g.id)).toEqual(["401802630", "401802647"]);
    for (const g of stockholm) {
      expect(g.neutralSite).toBe(true);
      expect(g.venue).toEqual({ name: "Avicii Arena", city: "Stockholm", country: "Sweden" });
    }
  });

  it("keeps Canadian venues' province as the state", () => {
    const ottawa = nhlPenguinsGames().find((g) => g.id === "401803489")!;
    expect(ottawa.venue).toMatchObject({ city: "Ottawa", state: "ON", country: "Canada" });
  });

  it("treats overtime and shootout finals as completed with a winner", () => {
    const games = nhlPenguinsGames();
    const ot = games.find((g) => g.id === "401802691")!;
    const so = games.find((g) => g.id === "401802485")!;
    for (const g of [ot, so]) {
      expect(g.status.completed).toBe(true);
      expect([g.homeTeam.winner, g.awayTeam.winner].filter(Boolean)).toHaveLength(1);
    }
    expect(ot.status.detail).toBe("Final/OT");
    expect(so.status.detail).toBe("Final/SO");
  });

  it("carries playoff series notes", () => {
    const playoffs = nhlPenguinsGames().filter((g) => g.seasonType.normalized === "postseason");
    expect(playoffs).toHaveLength(6);
    expect(playoffs[0].note).toBe("East 1st Round - Game 1");
    const scf = gamesFromFixtures("nhl", "37", { espnSeason: 2026, displayName: "2025-26" }, [
      "schedule-nhl-golden-knights-2026-post.json",
    ]);
    expect(scf.at(-1)!.note).toBe("Stanley Cup Final - Game 6");
  });

  it("uses team nicknames from schedule competitors", () => {
    const g = nhlPenguinsGames().find((x) => x.id === "401802860")!;
    expect(g.awayTeam.shortName).toBe("Mammoth");
    expect(g.homeTeam.shortName).toBe("Penguins");
  });
});
