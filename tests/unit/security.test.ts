import { describe, expect, it } from "vitest";

import { buildEspnUrl } from "@/lib/espn/client";
import { LEAGUES } from "@/lib/config/leagues";
import {
  PUBLIC_ID_RE,
  generateEditToken,
  generatePublicId,
  hashToken,
  verifyToken,
} from "@/lib/security/tokens";

describe("tokens", () => {
  it("generates short unguessable public ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, generatePublicId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(PUBLIC_ID_RE);
  });

  it("stores only hashes and verifies in constant time", () => {
    const token = generateEditToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken(generateEditToken(), hash)).toBe(false);
    expect(verifyToken(token, "abcd")).toBe(false);
  });
});

describe("ESPN URL building", () => {
  it("only builds URLs from the league registry", () => {
    expect(buildEspnUrl("site", LEAGUES.ncaaf, ["teams", "201", "schedule"], { season: 2026, seasontype: 2 })).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/201/schedule?season=2026&seasontype=2",
    );
    expect(buildEspnUrl("core", LEAGUES.nba, ["seasons", 2027])).toBe(
      "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2027",
    );
  });

  it("rejects path traversal and injected hosts", () => {
    expect(() => buildEspnUrl("site", LEAGUES.nfl, ["teams", "../../x"])).toThrow();
    expect(() => buildEspnUrl("site", LEAGUES.nfl, ["//evil.com"])).toThrow();
    expect(() => buildEspnUrl("site", LEAGUES.nfl, ["teams", "1?x=y"])).toThrow();
  });

  it("serializes boolean ESPN query values", () => {
    expect(buildEspnUrl("site", LEAGUES.epl, ["teams", "364", "schedule"], { season: 2026, fixture: true }))
      .toContain("fixture=true");
  });
});

describe("NCAAB ESPN endpoints", () => {
  it("builds schedule, D-I standings and core season URLs", () => {
    expect(buildEspnUrl("site", LEAGUES.ncaab, ["teams", "150", "schedule"], { season: 2027, seasontype: 2 })).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/150/schedule?season=2027&seasontype=2",
    );
    expect(buildEspnUrl("standings", LEAGUES.ncaab, ["standings"], { group: 50 })).toBe(
      "https://site.api.espn.com/apis/v2/sports/basketball/mens-college-basketball/standings?group=50",
    );
    expect(buildEspnUrl("core", LEAGUES.ncaab, ["season"])).toBe(
      "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/season",
    );
    expect(LEAGUES.ncaab.scheduleSeasonTypes).toEqual([2, 3]);
  });
});
