import { describe, expect, it } from "vitest";

import { buildCalendarEvents, eventTiming } from "@/lib/calendar/events";
import { filterGamesBySeasonType } from "@/lib/calendar/filters";
import { applyOverride, hasOverride } from "@/lib/calendar/overrides";
import { eventUid } from "@/lib/calendar/uid";
import type { SportsCalGame } from "@/lib/types";
import { defaultConfig } from "@/lib/validation/calendar-config";
import { soonersGames, steelersGames } from "../helpers";

const steelersConfig = () => defaultConfig("nfl", { id: "23", slug: "pittsburgh-steelers" });

describe("stable UIDs", () => {
  it("is deterministic per event and scope", () => {
    expect(eventUid("401873002", "23")).toBe("espn-401873002-23@sportscal.site");
    expect(eventUid("401873002", "abc123def456")).toBe("espn-401873002-abc123def456@sportscal.site");
    const a = buildCalendarEvents(steelersGames(), steelersConfig(), "23").map((e) => e.uid);
    const b = buildCalendarEvents(steelersGames(), steelersConfig(), "23").map((e) => e.uid);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("filters", () => {
  it("includes preseason, regular season, and postseason by default", () => {
    const config = steelersConfig();
    const events = buildCalendarEvents(steelersGames(), config, "23");
    expect(events.filter((e) => e.included)).toHaveLength(20);
    expect(events.filter((e) => e.excludedBy === "seasonType")).toHaveLength(0);
  });

  it("can include preseason", () => {
    const games = filterGamesBySeasonType(steelersGames(), { preseason: true, regularSeason: false, postseason: false });
    expect(games).toHaveLength(3);
  });
});

describe("durations", () => {
  it("uses league defaults and overrides", () => {
    expect(defaultConfig("nfl", { id: "1", slug: "a" }).durationMinutes).toBe(210);
    expect(defaultConfig("ncaaf", { id: "1", slug: "a" }).durationMinutes).toBe(210);
    expect(defaultConfig("nba", { id: "1", slug: "a" }).durationMinutes).toBe(150);
    const config = { ...steelersConfig(), overrides: { "401873002": { durationMinutes: 240 } } };
    const events = buildCalendarEvents(steelersGames(), config, "23");
    const g = events.find((e) => e.gameId === "401873002")!;
    expect(g.timing).toEqual({ kind: "timed", start: "2026-10-18T17:00:00.000Z", durationMinutes: 240 });
    expect(events.find((e) => e.gameId === "401872658")!.durationMinutes).toBe(210);
  });
});

describe("TBD handling", () => {
  it("makes all-day events for games with a date but no time", () => {
    const kentucky = soonersGames().find((g) => g.id === "401856722")!;
    expect(eventTiming(kentucky, 210)).toEqual({ kind: "allDay", date: "2026-10-17" });
  });

  it("never invents a date for truly unscheduled games", () => {
    const base = soonersGames()[0];
    const unscheduled: SportsCalGame = { ...base, startDate: "", localDate: undefined, dateTBD: true };
    expect(eventTiming(unscheduled, 210)).toEqual({ kind: "unscheduled" });
    const [event] = buildCalendarEvents([unscheduled], defaultConfig("ncaaf", { id: "201", slug: "oklahoma-sooners" }), "201");
    expect(event.included).toBe(false);
    expect(event.excludedBy).toBe("unscheduled");
  });

  it("keeps the same UID when a TBD time is published", () => {
    const config = defaultConfig("ncaaf", { id: "201", slug: "oklahoma-sooners" });
    const tbd = soonersGames().find((g) => g.id === "401856722")!;
    const timed: SportsCalGame = { ...tbd, timeTBD: false, startDate: "2026-10-17T20:30:00.000Z" };
    const [before] = buildCalendarEvents([tbd], config, "201");
    const [after] = buildCalendarEvents([timed], config, "201");
    expect(before.timing.kind).toBe("allDay");
    expect(after.timing.kind).toBe("timed");
    expect(after.uid).toBe(before.uid);
  });
});

describe("status changes", () => {
  const base = () => steelersGames().find((g) => g.id === "401873002")!;

  it("marks cancelled games CANCELLED instead of dropping them", () => {
    const game = { ...base(), status: { ...base().status, cancelled: true } };
    const [event] = buildCalendarEvents([game], steelersConfig(), "23");
    expect(event.status).toBe("CANCELLED");
    expect(event.included).toBe(true);
  });

  it("represents postponed games without a new time as tentative all-day events", () => {
    const game = { ...base(), status: { ...base().status, postponed: true } };
    const [event] = buildCalendarEvents([game], steelersConfig(), "23");
    expect(event.status).toBe("TENTATIVE");
    expect(event.timing).toEqual({ kind: "allDay", date: "2026-10-18" });
  });
});

describe("overrides", () => {
  it("are partial: other fields keep following the global templates", () => {
    const config = {
      ...steelersConfig(),
      templates: { ...steelersConfig().templates, description: "TV: {broadcast}" },
      overrides: { "401873002": { title: "Road trip!" } },
    };
    const event = buildCalendarEvents(steelersGames(), config, "23").find((e) => e.gameId === "401873002")!;
    expect(event.title).toBe("Road trip!");
    expect(event.description).toBe("TV: CBS");
    expect(event.location).toBe("Raymond James Stadium");
    expect(event.overridden).toBe(true);
  });

  it("can exclude a single game", () => {
    const config = { ...steelersConfig(), overrides: { "401873002": { excluded: true } } };
    const events = buildCalendarEvents(steelersGames(), config, "23");
    expect(events.find((e) => e.gameId === "401873002")!.excludedBy).toBe("override");
    expect(events.filter((e) => e.included)).toHaveLength(19);
  });

  it("merges field by field", () => {
    const base = { title: "T", description: "D", location: "L", durationMinutes: 210, excluded: false };
    expect(applyOverride(base, { location: "X" })).toEqual({ ...base, location: "X", overridden: true });
    expect(applyOverride(base, undefined).overridden).toBe(false);
    expect(hasOverride({ excluded: false })).toBe(false);
  });

  it("only adds the ESPN URL when enabled", () => {
    const off = buildCalendarEvents(steelersGames(), steelersConfig(), "23");
    expect(off.every((e) => e.url === undefined)).toBe(true);
    const on = buildCalendarEvents(steelersGames(), { ...steelersConfig(), includeEspnUrl: true }, "23");
    expect(on.find((e) => e.gameId === "401873002")!.url).toMatch(/^https:\/\/www\.espn\.com\//);
  });
});
