import { describe, expect, it } from "vitest";

import { LEAGUES, type LeagueKey } from "@/lib/config/leagues";
import { normalizeSeason } from "@/lib/espn/normalize";
import { espnSeasonSchema } from "@/lib/espn/schemas";
import { decideSeason, seasonPhase } from "@/lib/espn/seasons";
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
