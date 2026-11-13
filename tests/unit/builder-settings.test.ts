import { describe, expect, it } from "vitest";

import { defaultSettings, mergeSettings } from "@/hooks/use-builder-settings";
import { LEAGUES } from "@/lib/config/leagues";

describe("mergeSettings across leagues", () => {
  it("NFL defaults restored on MLB become MLB's defaults, keeping the doubleheader variable", () => {
    const stored = defaultSettings("nfl");
    const merged = mergeSettings("mlb", stored, "nfl");
    expect(merged.templates).toEqual(defaultSettings("mlb").templates);
    expect(merged.templates.title).toContain("{doubleheader}");
  });

  it("uses soccer defaults when switching to a soccer league", () => {
    const merged = mergeSettings("mls", defaultSettings("nfl"), "nfl");
    expect(merged.templates).toEqual(defaultSettings("mls").templates);
    expect(merged.templates.title).toBe(LEAGUES.mls.defaultTemplates?.title);
    expect(mergeSettings("epl", defaultSettings("mlb"), "mlb").templates).toEqual(defaultSettings("epl").templates);
  });

  it("keeps deliberately customized templates and translates only the untouched ones", () => {
    const stored = {
      ...defaultSettings("nfl"),
      templates: { ...defaultSettings("nfl").templates, title: "Go {team}!", description: "Notes" },
    };
    const merged = mergeSettings("mlb", stored, "nfl");
    expect(merged.templates.title).toBe("Go {team}!");
    expect(merged.templates.description).toBe("Notes");
    expect(merged.templates.calendarName).toBe(defaultSettings("mlb").templates.calendarName);
    expect(merged.templates.location).toBe(defaultSettings("mlb").templates.location);
  });

  it("keeps stored templates untouched when the league is unchanged", () => {
    const stored = { templates: { ...defaultSettings("mlb").templates, title: "Custom {opponent}" } };
    expect(mergeSettings("mlb", stored, "mlb").templates.title).toBe("Custom {opponent}");
  });

  it("falls back to the new league's default templates when the stored league is missing or invalid", () => {
    const stored = { templates: { ...defaultSettings("nfl").templates, title: "Custom {opponent}" } };
    for (const storedLeague of [undefined, "cricket", 42, null]) {
      const merged = mergeSettings("mlb", stored, storedLeague);
      expect(merged.templates).toEqual(defaultSettings("mlb").templates);
    }
  });

  it("still ignores malformed non-template values", () => {
    const merged = mergeSettings("mlb", { busyStatus: "nope", includeEspnUrl: "yes" } as never, "mlb");
    expect(merged.busyStatus).toBe("free");
    expect(merged.includeEspnUrl).toBe(false);
  });
});
