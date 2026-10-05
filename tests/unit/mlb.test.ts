import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { LEAGUES } from "@/lib/config/leagues";
import { buildGames } from "@/lib/espn/schedules";
import { buildCatalog, membershipFromGroups, parseTeamsResponse } from "@/lib/espn/teams";
import { dateInZone, normalizeBroadcasts, normalizeSeason, normalizeSeasonType } from "@/lib/espn/normalize";
import { espnSeasonSchema } from "@/lib/espn/schemas";
import { buildCalendarEvents, eventStatus, eventTiming } from "@/lib/calendar/events";
import { generateIcs } from "@/lib/calendar/generator";
import { gameTemplateValues, renderTemplate } from "@/lib/calendar/templates";
import { calendarConfigSchema, defaultConfig, defaultTemplates, isDefaultConfig, LIMITS } from "@/lib/validation/calendar-config";
import { defaultSettings } from "@/hooks/use-builder-settings";
import { decideSeason } from "@/lib/espn/seasons";
import { fixture } from "../helpers";

const season = { espnSeason: 2026, displayName: "2026" };
const config = defaultConfig("mlb", { id: "19", slug: "los-angeles-dodgers" });
const build = (responses: unknown[], year = 2026, teamId = "19") => buildGames(responses, {
  league: LEAGUES.mlb, teamId, season: { espnSeason: year, displayName: String(year) },
});
const reg = () => fixture("schedule-mlb-dodgers-2026-reg.json") as { events: Record<string, unknown>[] };
const games = () => build([fixture("schedule-mlb-dodgers-2026-pre.json"), reg(), fixture("schedule-mlb-dodgers-2026-post.json")]);

describe("MLB catalog and seasons", () => {
  it("groups 30 teams into six divisions without ESPN group ids", () => {
    const teams = buildCatalog(LEAGUES.mlb, parseTeamsResponse(fixture("teams-mlb.json")), membershipFromGroups(fixture("groups-mlb.json")));
    expect(teams).toHaveLength(30);
    expect(new Set(teams.map(t => t.conference?.shortName))).toEqual(new Set(["AL", "NL"]));
    const divisions = new Map<string, number>();
    for (const t of teams) {
      expect(t.conference?.id).toBeUndefined();
      expect(t.division?.id).toBeUndefined();
      divisions.set(t.division!.name, (divisions.get(t.division!.name) ?? 0) + 1);
    }
    expect(divisions.size).toBe(6);
    expect([...divisions.values()]).toEqual([5, 5, 5, 5, 5, 5]);
    expect(teams.find(t => t.id === "11")).toMatchObject({ slug: "athletics", name: "Athletics", shortName: "Athletics", displayName: "Athletics" });
  });
  it("maps Spring Training and off-season types", () => {
    expect(["1", "2", "3", "4"].map(id => normalizeSeasonType({ id }, LEAGUES.mlb))).toEqual(["preseason", "regular", "postseason", "other"]);
    expect(normalizeSeasonType({ abbreviation: "pre", name: "Spring Training" }, LEAGUES.mlb)).toBe("preseason");
  });
  it("stays active through postseason and advances only after the season ends", () => {
    const current = normalizeSeason(espnSeasonSchema.parse(fixture("season-mlb-2026.json")), LEAGUES.mlb);
    const next = normalizeSeason(espnSeasonSchema.parse(fixture("season-mlb-2027.json")), LEAGUES.mlb);
    expect(decideSeason({ current, next, nextEventCount: 2431 }, new Date("2026-10-02T12:00Z"))).toEqual({ ...season, status: "active" });
    expect(decideSeason({ current, next, nextEventCount: 2431 }, new Date("2026-11-13T12:00Z"))).toEqual({ espnSeason: 2027, displayName: "2027", status: "upcoming" });
    expect(decideSeason({ current, next, nextEventCount: 0 }, new Date("2026-11-13T12:00Z")).espnSeason).toBe(2026);
  });
});

describe("MLB schedules and calendar events", () => {
  it("merges types, deduplicates ids, suppresses weeks and preserves split squads", () => {
    const result = build([fixture("schedule-mlb-dodgers-2026-pre.json"), reg(), reg(), fixture("schedule-mlb-dodgers-2026-post.json")]);
    expect(result).toHaveLength(15);
    expect(new Set(result.map(g => g.id)).size).toBe(result.length);
    expect(result.every(g => !g.week)).toBe(true);
    expect(result.map(g => g.startDate)).toEqual(result.map(g => g.startDate).sort());
    const split = result.filter(g => g.startDate === "2026-02-28T20:05:00.000Z");
    expect(split).toHaveLength(2);
    expect(split.every(g => !g.doubleheader)).toBe(true);
    const events = buildCalendarEvents(split, config, "19");
    expect(new Set(events.map(e => e.uid)).size).toBe(2);
    expect(new Set(events.map(e => e.title)).size).toBe(2);
    expect(events.every(e => e.timing.kind === "timed")).toBe(true);
  });
  it("gives doubleheaders distinct UIDs and Game 1/Game 2 titles", () => {
    const pair = games().filter(g => g.doubleheader);
    expect(pair.map(g => g.doubleheader?.game)).toEqual([1, 2]);
    const events = buildCalendarEvents(pair, config, "19");
    expect(events.map(e => e.title)).toEqual(["Dodgers @ Yankees Game 1", "Dodgers @ Yankees Game 2"]);
    expect(events[0].uid).not.toBe(events[1].uid);
  });
  it("supports dash variants, fallback pairing, and excludes TBD or distant pairs", () => {
    const raw = reg();
    const pair = raw.events.filter(e => ["401897386", "401816172"].includes(String(e.id)));
    type Raw = { competitions: { notes: { headline: string }[]; timeValid: boolean; date?: string }[]; date: string };
    const first = pair[0] as unknown as Raw;
    first.competitions[0].notes[0].headline = "Doubleheader – Game 1 – Makeup from July 18";
    expect(build([{ events: pair }])[0].doubleheader?.game).toBe(1);
    for (const e of pair) (e as unknown as Raw).competitions[0].notes = [];
    expect(build([{ events: pair }]).map(g => g.doubleheader?.game)).toEqual([1, 2]);
    first.competitions[0].timeValid = false;
    expect(build([{ events: pair }]).every(g => !g.doubleheader)).toBe(true);
    first.competitions[0].timeValid = true;
    first.date = "2026-07-19T05:00Z";
    first.competitions[0].date = first.date;
    expect(build([{ events: pair }]).every(g => !g.doubleheader)).toBe(true);
  });
  it("cancels postponed originals but keeps their makeup and if-necessary games", () => {
    const result = games();
    const postponed = result.find(g => g.status.postponed)!;
    expect(eventStatus(postponed)).toBe("CANCELLED");
    expect(eventTiming(postponed, 180)).toEqual({ kind: "allDay", date: "2026-07-18" });
    expect(eventStatus({ ...postponed, league: "nfl" })).toBe("TENTATIVE");
    expect(eventStatus(result.find(g => g.id === "401897386")!)).toBe("CONFIRMED");
    expect(eventStatus(result.find(g => /If Necessary/.test(g.note ?? ""))!)).toBe("TENTATIVE");
    const ics = new ICAL.Component(ICAL.parse(generateIcs(buildCalendarEvents(result, config, "19"), { calendarName: "Dodgers" })));
    expect(ics.getAllSubcomponents("vevent")).toHaveLength(15);
    expect(ics.getAllSubcomponents("vevent").filter(e => e.getFirstPropertyValue("status") === "CANCELLED")).toHaveLength(1);
  });
  it("uses all-day Eastern dates for future schedules, then retains UID when timed", () => {
    const result = build([fixture("schedule-mlb-athletics-2027-reg.json")], 2027, "11");
    const athConfig = defaultConfig("mlb", { id: "11", slug: "athletics" });
    expect(result).toHaveLength(5);
    expect(result.every(g => g.timeTBD)).toBe(true);
    const events = buildCalendarEvents(result, athConfig, "11");
    expect(events[0].timing).toEqual({ kind: "allDay", date: "2027-03-25" });
    const [after] = buildCalendarEvents([{ ...result[0], timeTBD: false }], athConfig, "11");
    expect(after.uid).toBe(events[0].uid);
    expect(after.timing.kind).toBe("timed");
    expect(dateInZone("2027-11-10T05:00Z", "America/New_York")).toBe("2027-11-10");
    expect(gameTemplateValues(result[0])).toMatchObject({ team: "Athletics", teamShort: "Athletics", teamFull: "Athletics" });
  });
  it("retains neutral international venues and removes radio broadcasts", () => {
    const [game] = build([fixture("schedule-mlb-padres-2026-reg-mexico.json")], 2026, "25");
    expect(game.neutralSite).toBe(true);
    expect(gameTemplateValues(game).homeAwaySymbol).toBe("vs");
    expect(game.venue?.city).toBe("Mexico City");
    expect(game.venue?.country).toBeUndefined();
    expect(games().every(g => !g.broadcasts.includes("ERADM"))).toBe(true);
    expect(normalizeBroadcasts([
      { type: { shortName: "Radio" }, media: { shortName: "ERADM" } },
      { type: { shortName: "TV" }, media: { shortName: "FOX" } },
    ])).toEqual(["FOX"]);
  });
  it("uses MLB defaults throughout builder, templates and saved config validation", () => {
    expect(config.durationMinutes).toBe(180);
    expect(defaultTemplates("mlb").title).toBe("{team} {homeAwaySymbol} {opponent} {doubleheader}");
    expect(defaultSettings("mlb").templates).toEqual(config.templates);
    expect(calendarConfigSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(isDefaultConfig(config)).toBe(true);
    const spring = games().find(g => g.seasonType.normalized === "preseason")!;
    expect(gameTemplateValues(spring).seasonType).toBe("Spring Training");
    expect(renderTemplate(config.templates.title, gameTemplateValues(spring))).not.toMatch(/Game|\s$/);
    expect(defaultTemplates("nfl").title).toBe("{team} {homeAwaySymbol} {opponent}");
    expect(defaultTemplates("epl").title).toBe("{homeTeam} v {awayTeam}");
    const overrides = Object.fromEntries(Array.from({ length: LIMITS.overrides }, (_, i) => [String(i), { excluded: true }]));
    expect(calendarConfigSchema.safeParse({ ...config, overrides }).success).toBe(true);
    expect(calendarConfigSchema.safeParse({ ...config, overrides: { ...overrides, extra: { excluded: true } } }).success).toBe(false);
  });
});
