import { describe, expect, it } from "vitest";

import { LEAGUES } from "@/lib/config/leagues";
import { normalizeBroadcasts, normalizeSeasonType, normalizeVenue } from "@/lib/espn/normalize";
import { buildCalendarEvents } from "@/lib/calendar/events";
import { generateIcs } from "@/lib/calendar/generator";
import { defaultConfig } from "@/lib/validation/calendar-config";
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

describe("flat soccer team catalogs", () => {
  it("normalizes soccer URL slugs and omits grouping metadata", () => {
    const teams = buildCatalog(LEAGUES.epl, [
      { id: "1", slug: "eng.man_city", displayName: "Manchester City", shortDisplayName: "Man City", isActive: true },
      { id: "2", slug: "eng.man_city_alt", displayName: "Manchester City", shortDisplayName: "Man City", isActive: true },
    ], new Map());
    expect(teams.map((team) => team.slug)).toEqual(["manchester-city", "manchester-city-2"]);
    expect(teams.every((team) => team.tier === "primary" && !team.conference && !team.division)).toBe(true);
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

describe("NCAAB D-I catalogs and schedules", () => {
  it("backfills standings-only teams without losing catalog metadata or adding duplicates", () => {
    const membership = membershipFromStandings(fixture("standings-ncaab-d1.json"), "primary");
    const raw = parseTeamsResponse(fixture("teams-ncaab.json"));
    const catalog = buildCatalog(LEAGUES.ncaab, raw, membership);
    const expected = {
      "2511": "queens-university-royals",
      "2598": "saint-francis-red-wolves",
      "88": "southern-indiana-screaming-eagles",
      "2815": "lindenwood-lions",
    };
    for (const [id, slug] of Object.entries(expected)) {
      expect(raw.some((t) => t.id === id)).toBe(false);
      expect(catalog.find((t) => t.id === id)).toMatchObject({ slug, tier: "primary", subdivision: "Division I" });
      expect(catalog.find((t) => t.id === id)?.logo).toMatch(/^https:/);
    }
    expect(new Set(catalog.map((t) => t.id)).size).toBe(catalog.length);
    expect(catalog.every((t) => t.isFbs === undefined)).toBe(true);
    expect(catalog.find((t) => t.id === "150")).toMatchObject({ conference: { name: "ACC" }, color: "#00539b" });
    expect(catalog.find((t) => t.id === "2697")?.tier).toBe("other");
    expect([...membership.keys()].every((id) => catalog.find((t) => t.id === id)?.tier === "primary")).toBe(true);
    expect(catalog.some((t) => t.conference?.name === "Metro")).toBe(true);
  });

  it("preserves an inactive catalog entry over active standings metadata", () => {
    const membership = membershipFromStandings(fixture("standings-ncaab-d1.json"), "primary");
    const catalog = buildCatalog(LEAGUES.ncaab, [{ id: "150", displayName: "Duke Blue Devils", isActive: false }], membership);
    expect(catalog.some((t) => t.id === "150")).toBe(false);
  });

  it("loads Duke's upcoming games even when the empty postseason echoes another season", () => {
    const games = gamesFromFixtures("ncaab", "150", { espnSeason: 2027, displayName: "2026-27" }, [
      "schedule-ncaab-duke-2027-reg.json", "schedule-ncaab-duke-2027-post-empty.json",
    ]);
    expect(games).toHaveLength(33);
    expect(games.filter((g) => g.timeTBD)).toHaveLength(26);
    expect(games[0].localDate).toBe("2026-11-02");
    expect(games.find((g) => g.note === "Champions Classic")).toMatchObject({ neutralSite: true, timeTBD: true });
    const empty = fixture("schedule-ncaab-duke-2027-post-empty.json") as object;
    expect(buildGames([{ ...empty, season: { year: 2026 } }], {
      league: LEAGUES.ncaab, teamId: "150", season: { espnSeason: 2027, displayName: "2026-27" },
    })).toEqual([]);
  });

  it("keeps ACC tournaments regular and NCAA rounds postseason with notes", () => {
    const games = gamesFromFixtures("ncaab", "150", { espnSeason: 2026, displayName: "2025-26" }, [
      "schedule-ncaab-duke-2026-reg.json", "schedule-ncaab-duke-2026-post.json",
    ]);
    const acc = games.filter((g) => g.note?.includes("ACC Tournament"));
    expect(acc).toHaveLength(3);
    expect(acc.every((g) => g.neutralSite && g.seasonType.normalized === "regular")).toBe(true);
    const ncaa = games.filter((g) => g.seasonType.normalized === "postseason");
    expect(ncaa).toHaveLength(4);
    expect(ncaa.every((g) => g.note?.includes("East Region") && !g.week)).toBe(true);
  });

  it("tolerates a non-D-I opponent without a logo or abbreviation", () => {
    const [game] = gamesFromFixtures("ncaab", "147", { espnSeason: 2027, displayName: "2026-27" }, [
      "schedule-ncaab-montana-state-2027-reg.json",
    ]);
    expect(game.awayTeam).toMatchObject({ displayName: "Northwest Indian RedHawks", abbreviation: "" });
    expect(game.awayTeam.logo).toBeUndefined();
    const config = defaultConfig("ncaab", { id: "147", slug: "montana-state-bobcats" });
    config.templates.title = "{teamAbbr} {homeAwaySymbol} {opponentAbbr}";
    config.templates.description = "{opponent} {venue}";
    const [event] = buildCalendarEvents([game], config, "147");
    expect(event.title).toBe("MTST vs");
    expect(event.description).toContain("NW Indian");
    expect(generateIcs([event], { calendarName: "Montana State" })).toContain("BEGIN:VEVENT");
  });

  it("documents existing placeholder handling without inventing bracket games", () => {
    const response = fixture("schedule-ncaab-duke-2027-reg.json") as { events: { competitions: { competitors: { team: object; homeAway: string }[] }[] }[] };
    const event = structuredClone(response.events[0]);
    const opponent = event.competitions[0].competitors.find((c) => c.homeAway === "away")!;
    opponent.team = { id: "-1", displayName: "TBD" };
    const [game] = buildGames([{ events: [event] }], {
      league: LEAGUES.ncaab, teamId: "150", season: { espnSeason: 2027, displayName: "2026-27" },
    });
    expect(game.awayTeam).toMatchObject({ id: "-1", displayName: "TBD" });
    event.competitions[0].competitors = event.competitions[0].competitors.filter((c) => c.homeAway === "home");
    expect(buildGames([{ events: [event] }], {
      league: LEAGUES.ncaab, teamId: "150", season: { espnSeason: 2027, displayName: "2026-27" },
    })).toEqual([]);
  });
});
