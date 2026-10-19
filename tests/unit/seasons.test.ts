import { afterEach, describe, expect, it, vi } from "vitest";

import { LEAGUES, type LeagueKey } from "@/lib/config/leagues";
import { normalizeScoreboardSeason, normalizeSeason } from "@/lib/espn/normalize";
import { espnScoreboardSchema, espnSeasonSchema } from "@/lib/espn/schemas";
import { decideSeason, probeDate, resolveLeagueSeason, resolveManualSeason, seasonPhase } from "@/lib/espn/seasons";
import type { SeasonMeta } from "@/lib/espn/types";
import { fixture } from "../helpers";

function season(league: LeagueKey, file: string): SeasonMeta {
  return normalizeSeason(espnSeasonSchema.parse(fixture(file)), LEAGUES[league]);
}

/** Shift a real ESPN season calendar by whole years to model neighbouring seasons. */
function shift(meta: SeasonMeta, years: number, displayName: string): SeasonMeta {
  const move = (iso?: string) => {
    if (!iso) return iso;
    const d = new Date(iso);
    d.setUTCFullYear(d.getUTCFullYear() + years);
    return d.toISOString();
  };
  return {
    year: meta.year + years,
    displayName,
    startDate: move(meta.startDate),
    endDate: move(meta.endDate),
    types: meta.types.map((t) => ({ ...t, startDate: move(t.startDate), endDate: move(t.endDate) })),
  };
}

const at = (iso: string) => new Date(iso);

describe("NFL season resolution", () => {
  const nfl2026 = season("nfl", "season-nfl-2026.json");
  const nfl2025 = shift(nfl2026, -1, "2025");
  const nfl2027 = shift(nfl2026, 1, "2027");

  it("uses the in-progress season", () => {
    expect(decideSeason({ current: nfl2026 }, at("2026-10-01T00:00:00Z"))).toEqual({
      espnSeason: 2026,
      displayName: "2026",
      status: "active",
    });
  });

  it("treats the preseason window as upcoming", () => {
    expect(seasonPhase(nfl2026, at("2026-08-20T00:00:00Z"))).toBe("upcoming");
  });

  it("keeps the season active through the Super Bowl", () => {
    expect(seasonPhase(nfl2026, at("2027-02-10T00:00:00Z"))).toBe("active");
  });

  it("moves to the next season once ESPN has published its games", () => {
    const result = decideSeason({ current: nfl2025, next: nfl2026, nextEventCount: 272 }, at("2026-06-01T00:00:00Z"));
    expect(result).toEqual({ espnSeason: 2026, displayName: "2026", status: "upcoming" });
  });

  it("falls back to the latest season when the next schedule isn't published", () => {
    const result = decideSeason({ current: nfl2026, next: nfl2027, nextEventCount: 0 }, at("2027-03-01T00:00:00Z"));
    expect(result).toEqual({
      espnSeason: 2026,
      displayName: "2026",
      status: "completed",
      pendingNextSeason: { espnSeason: 2027, displayName: "2027" },
    });
  });

  it("falls back when ESPN doesn't know the next season at all", () => {
    const result = decideSeason({ current: nfl2026, next: null }, at("2027-03-01T00:00:00Z"));
    expect(result.espnSeason).toBe(2026);
    expect(result.status).toBe("completed");
    expect(result.pendingNextSeason?.espnSeason).toBe(2027);
  });

  it("rolls an auto subscription from 2026 to 2027 across the year boundary", () => {
    const before = decideSeason({ current: nfl2026 }, at("2026-12-01T00:00:00Z"));
    const after = decideSeason({ current: nfl2026, next: nfl2027, nextEventCount: 272 }, at("2027-05-20T00:00:00Z"));
    expect(before.espnSeason).toBe(2026);
    expect(after.espnSeason).toBe(2027);
  });
});

describe("NBA season resolution (cross-calendar-year seasons)", () => {
  const nba2027 = season("nba", "season-nba-2027.json");
  const nba2026 = season("nba", "season-nba-2026.json");

  it("uses ESPN's display label, not the numeric season id", () => {
    const result = decideSeason({ current: nba2027 }, at("2026-09-28T12:00:00Z"));
    expect(result).toEqual({ espnSeason: 2027, displayName: "2026-27", status: "upcoming" });
  });

  it("is active from opening night through the Finals", () => {
    expect(seasonPhase(nba2027, at("2026-11-15T00:00:00Z"))).toBe("active");
    expect(seasonPhase(nba2027, at("2027-06-10T00:00:00Z"))).toBe("active");
  });

  it("counts the play-in and playoffs as part of the season", () => {
    expect(seasonPhase(nba2026, at("2026-04-15T00:00:00Z"))).toBe("active");
    expect(seasonPhase(nba2026, at("2026-05-30T00:00:00Z"))).toBe("active");
  });

  it("moves from 2025-26 to 2026-27 in the offseason once games are published", () => {
    const result = decideSeason({ current: nba2026, next: nba2027, nextEventCount: 1230 }, at("2026-08-15T00:00:00Z"));
    expect(result).toEqual({ espnSeason: 2027, displayName: "2026-27", status: "upcoming" });
  });

  it("stays on 2025-26 in the offseason until the next schedule exists", () => {
    const result = decideSeason({ current: nba2026, next: nba2027, nextEventCount: 0 }, at("2026-07-15T00:00:00Z"));
    expect(result.displayName).toBe("2025-26");
    expect(result.status).toBe("completed");
    expect(result.pendingNextSeason).toEqual({ espnSeason: 2027, displayName: "2026-27" });
  });
});

describe("NCAAF season resolution", () => {
  const cfb2026 = season("ncaaf", "season-ncaaf-2026.json");
  const cfb2027 = shift(cfb2026, 1, "2027");

  it("is active during bowl season", () => {
    expect(decideSeason({ current: cfb2026 }, at("2026-12-28T00:00:00Z")).status).toBe("active");
  });

  it("moves to next season after the title game when published", () => {
    const result = decideSeason({ current: cfb2026, next: cfb2027, nextEventCount: 800 }, at("2027-03-01T00:00:00Z"));
    expect(result).toEqual({ espnSeason: 2027, displayName: "2027", status: "upcoming" });
  });

  it("treats spring as upcoming when ESPN has already rolled over", () => {
    expect(decideSeason({ current: cfb2027 }, at("2027-04-01T00:00:00Z"))).toEqual({
      espnSeason: 2027,
      displayName: "2027",
      status: "upcoming",
    });
  });
});

describe("NHL season resolution", () => {
  const nhl2027 = season("nhl", "season-nhl-2027.json");
  const nhl2026 = season("nhl", "season-nhl-2026.json");

  it("is active once the 2026-27 regular season has started", () => {
    expect(decideSeason({ current: nhl2027 }, at("2026-10-02T12:00:00Z"))).toEqual({
      espnSeason: 2027,
      displayName: "2026-27",
      status: "active",
    });
  });

  it("treats the preseason window as upcoming", () => {
    expect(seasonPhase(nhl2027, at("2026-09-20T00:00:00Z"))).toBe("upcoming");
  });

  it("moves to 2026-27 in the offseason once games are published", () => {
    const result = decideSeason({ current: nhl2026, next: nhl2027, nextEventCount: 1344 }, at("2026-08-01T00:00:00Z"));
    expect(result).toEqual({ espnSeason: 2027, displayName: "2026-27", status: "upcoming" });
  });
});

describe("NCAAB season resolution", () => {
  const current = season("ncaab", "season-ncaab-2027.json");
  const previous = season("ncaab", "season-ncaab-2026.json");

  it("uses the published upcoming season and its ending-year label", () => {
    expect(seasonPhase(current, at("2026-10-02T12:00:00Z"))).toBe("upcoming");
    expect(decideSeason({ current }, at("2026-10-02T12:00:00Z"))).toEqual({
      espnSeason: 2027, displayName: "2026-27", status: "upcoming",
    });
  });

  it("stays on the completed season until the next schedule is published", () => {
    expect(decideSeason({ current: previous, next: current, nextEventCount: 0 }, at("2026-05-01T12:00:00Z"))).toEqual({
      espnSeason: 2026, displayName: "2025-26", status: "completed",
      pendingNextSeason: { espnSeason: 2027, displayName: "2026-27" },
    });
  });
});

describe("seasons from the site scoreboard", () => {
  const scoreboard = (league: LeagueKey, file: string) =>
    normalizeScoreboardSeason(espnScoreboardSchema.parse(fixture(file)), LEAGUES[league]);

  afterEach(() => vi.unstubAllGlobals());

  it("reads season-type windows from a week-based calendar", () => {
    const { season: nfl, publishedSlots } = scoreboard("nfl", "scoreboard-nfl.json");
    expect(nfl).toMatchObject({ year: 2026, displayName: "2026" });
    expect(nfl.types.map((t) => t.normalized)).toEqual(["preseason", "regular", "postseason", "other"]);
    expect(publishedSlots).toBeGreaterThan(0);
    expect(seasonPhase(nfl, at("2026-08-20T00:00:00Z"))).toBe("upcoming");
    expect(seasonPhase(nfl, at("2026-10-20T00:00:00Z"))).toBe("active");
  });

  it("falls back to season dates for day-based calendars", () => {
    const { season: mlb, publishedSlots } = scoreboard("mlb", "scoreboard-mlb-2027.json");
    expect(mlb).toMatchObject({ year: 2027, displayName: "2027", types: [] });
    expect(publishedSlots).toBe(80);
    expect(seasonPhase(mlb, at("2027-01-15T00:00:00Z"))).toBe("upcoming");
  });

  it("probes the middle of the season, shifted by whole years", () => {
    const { season: wnba } = scoreboard("wnba", "scoreboard-wnba.json");
    expect(probeDate(wnba, 2027).toISOString().slice(0, 10)).toBe("2027-07-18");
    expect(probeDate(wnba, 2024).toISOString().slice(0, 10)).toBe("2024-07-18");
  });

  it("moves to the next season once ESPN publishes it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/scoreboard")) return Response.json(fixture("scoreboard-wnba.json"));
      if (url.includes("/scoreboard?dates=")) return Response.json({
        leagues: [{ season: { year: 2027, displayName: "2027", startDate: "2027-04-02T07:00Z", endDate: "2027-10-31T06:59Z" }, calendarType: "day", calendar: ["2027-05-15T07:00Z"] }],
      });
      throw new Error(`Unexpected ESPN request: ${url}`);
    }));
    expect(await resolveLeagueSeason(LEAGUES.wnba, at("2026-11-02T12:00:00Z"))).toEqual({ espnSeason: 2027, displayName: "2027", status: "upcoming" });
  });

  it("returns null for a manual season ESPN doesn't know", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => Response.json(fixture(
      String(input).endsWith("/scoreboard") ? "scoreboard-wnba.json" : "scoreboard-wnba-2027-unpublished.json",
    ))));
    expect(await resolveManualSeason(LEAGUES.wnba, 2027, at("2026-11-02T12:00:00Z"))).toBeNull();
    expect(await resolveManualSeason(LEAGUES.wnba, 2026, at("2026-11-02T12:00:00Z"))).toEqual({ espnSeason: 2026, displayName: "2026", status: "completed" });
  });
});
