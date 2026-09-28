import { describe, expect, it } from "vitest";

import {
  LIMITS,
  calendarConfigSchema,
  compactOverrides,
  defaultConfig,
  isDefaultConfig,
} from "@/lib/validation/calendar-config";

const valid = () => defaultConfig("ncaaf", { id: "201", slug: "oklahoma-sooners" });

describe("calendar config validation", () => {
  it("has the specified defaults", () => {
    const c = valid();
    expect(c.include).toEqual({ preseason: false, regularSeason: true, postseason: true });
    expect(c.templates).toEqual({
      calendarName: "{team} {season} Schedule",
      title: "{team} {homeAwaySymbol} {opponent}",
      description: "",
      location: "{venue}",
    });
    expect(c.busyStatus).toBe("free");
    expect(c.includeEspnUrl).toBe(false);
    expect(calendarConfigSchema.parse(c)).toEqual(c);
  });

  it("rejects unknown leagues, bad ids and extra keys", () => {
    expect(calendarConfigSchema.safeParse({ ...valid(), league: "mlb" }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), teamId: "../../etc" }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), teamSlug: "Oklahoma Sooners" }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), evil: true }).success).toBe(false);
  });

  it("limits template and override sizes", () => {
    const long = "x".repeat(LIMITS.description + 1);
    expect(calendarConfigSchema.safeParse({ ...valid(), templates: { ...valid().templates, description: long } }).success).toBe(false);
    const overrides = Object.fromEntries(
      Array.from({ length: LIMITS.overrides + 1 }, (_, i) => [String(i), { excluded: true }]),
    );
    expect(calendarConfigSchema.safeParse({ ...valid(), overrides }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), overrides: { "1": { unknown: 1 } } }).success).toBe(false);
  });

  it("requires a season for manual mode and bounds durations", () => {
    expect(calendarConfigSchema.safeParse({ ...valid(), seasonMode: "manual" }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), seasonMode: "manual", seasonOverride: 2025 }).success).toBe(true);
    expect(calendarConfigSchema.safeParse({ ...valid(), durationMinutes: 5 }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ ...valid(), durationMinutes: 99999 }).success).toBe(false);
  });

  it("detects default configurations (canonical feed)", () => {
    expect(isDefaultConfig(valid())).toBe(true);
    expect(isDefaultConfig({ ...valid(), overrides: { "1": {} } })).toBe(true);
    expect(isDefaultConfig({ ...valid(), busyStatus: "busy" })).toBe(false);
    expect(isDefaultConfig({ ...valid(), overrides: { "1": { title: "x" } } })).toBe(false);
  });

  it("compacts empty overrides", () => {
    expect(compactOverrides({ a: {}, b: { excluded: false }, c: { title: "t" } })).toEqual({ c: { title: "t" } });
  });
});
