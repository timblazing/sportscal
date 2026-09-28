import ICAL from "ical.js";
import { describe, expect, it } from "vitest";

import { buildCalendarEvents } from "@/lib/calendar/events";
import { generateIcs } from "@/lib/calendar/generator";
import type { SportsCalGame } from "@/lib/types";
import { defaultConfig, type CalendarConfig } from "@/lib/validation/calendar-config";
import { soonersGames, steelersGames } from "../helpers";

const NOW = new Date("2026-09-28T12:00:00Z");

function parse(ics: string) {
  const component = new ICAL.Component(ICAL.parse(ics));
  return { calendar: component, events: component.getAllSubcomponents("vevent") };
}

function generate(games: SportsCalGame[], config: CalendarConfig, scope: string, name = "Test Calendar") {
  return generateIcs(buildCalendarEvents(games, config, scope), { calendarName: name, now: NOW });
}

describe("ICS generation", () => {
  const config = defaultConfig("nfl", { id: "23", slug: "pittsburgh-steelers" });
  const ics = generate(steelersGames(), config, "23", "Steelers 2026 Schedule");
  const { calendar, events } = parse(ics);

  it("produces a valid VCALENDAR with SportsCal headers", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(calendar.getFirstPropertyValue("version")).toBe("2.0");
    expect(calendar.getFirstPropertyValue("prodid")).toBe("-//sportscal.site//SportsCal//EN");
    expect(calendar.getFirstPropertyValue("method")).toBe("PUBLISH");
    expect(calendar.getFirstPropertyValue("calscale")).toBe("GREGORIAN");
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe("Steelers 2026 Schedule");
  });

  it("includes one VEVENT per included game", () => {
    expect(events).toHaveLength(17);
  });

  it("uses stable UIDs, UTC start times and durations", () => {
    const event = events.find((e) => e.getFirstPropertyValue("uid") === "espn-401873002-23@sportscal.site")!;
    expect(event).toBeDefined();
    expect(event.getFirstPropertyValue("summary")).toBe("Steelers @ Buccaneers");
    const start = event.getFirstPropertyValue("dtstart") as ICAL.Time;
    expect(start.toJSDate().toISOString()).toBe("2026-10-18T17:00:00.000Z");
    expect(start.zone?.tzid).toBe("UTC");
    expect(String(event.getFirstPropertyValue("duration"))).toBe("PT3H30M");
    expect(event.getFirstPropertyValue("transp")).toBe("TRANSPARENT");
    expect(event.getFirstPropertyValue("location")).toBe("Raymond James Stadium");
  });

  it("keeps descriptions blank by default and adds no URL", () => {
    for (const e of events) {
      expect(e.getFirstPropertyValue("description")).toBeNull();
      expect(e.getFirstPropertyValue("url")).toBeNull();
    }
  });

  it("is identical apart from DTSTAMP when regenerated (stable feed)", () => {
    const again = generate(steelersGames(), config, "23", "Steelers 2026 Schedule");
    const strip = (s: string) => s.replace(/^DTSTAMP:.*$/gm, "");
    expect(strip(again)).toBe(strip(ics));
  });
});

describe("ICS details", () => {
  const sooners = defaultConfig("ncaaf", { id: "201", slug: "oklahoma-sooners" });

  it("creates all-day events for TBD kickoffs, not fake midnight times", () => {
    const { events } = parse(generate(soonersGames(), sooners, "201"));
    const kentucky = events.find((e) => e.getFirstPropertyValue("uid") === "espn-401856722-201@sportscal.site")!;
    const start = kentucky.getFirstPropertyValue("dtstart") as ICAL.Time;
    const end = kentucky.getFirstPropertyValue("dtend") as ICAL.Time;
    expect(start.isDate).toBe(true);
    expect(start.toString()).toBe("2026-10-17");
    expect(end.toString()).toBe("2026-10-18");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const config = {
      ...sooners,
      templates: { ...sooners.templates, description: "Line one; with semicolon\nLine two, with comma", location: "{venue}" },
    };
    const ics = generate(soonersGames(), config, "201");
    expect(ics).toContain("LOCATION:Memorial Stadium (Norman\\, OK)");
    expect(ics).toContain("Line one\\; with semicolon\\nLine two\\, with comma");
    const { events } = parse(ics);
    const e = events.find((ev) => ev.getFirstPropertyValue("uid") === "espn-401856664-201@sportscal.site")!;
    expect(e.getFirstPropertyValue("description")).toBe("Line one; with semicolon\nLine two, with comma");
    expect(e.getFirstPropertyValue("location")).toBe("Memorial Stadium (Norman, OK)");
  });

  it("marks cancelled games with STATUS:CANCELLED and keeps the UID", () => {
    const games = soonersGames().map((g) =>
      g.id === "401856717" ? { ...g, status: { ...g.status, cancelled: true } } : g,
    );
    const { events } = parse(generate(games, sooners, "201"));
    const texas = events.find((e) => e.getFirstPropertyValue("uid") === "espn-401856717-201@sportscal.site")!;
    expect(texas.getFirstPropertyValue("status")).toBe("CANCELLED");
    expect(events).toHaveLength(12);
  });

  it("supports busy events and the ESPN URL field", () => {
    const ics = generate(soonersGames(), { ...sooners, busyStatus: "busy", includeEspnUrl: true }, "201");
    const { events } = parse(ics);
    expect(events[0].getFirstPropertyValue("transp")).toBe("OPAQUE");
    expect(String(events[0].getFirstPropertyValue("url"))).toMatch(/^https:\/\/www\.espn\.com\//);
  });

  it("uses the saved calendar id in UIDs for custom feeds", () => {
    const { events } = parse(generate(soonersGames(), sooners, "k3j9x0a1b2c4"));
    expect(events[0].getFirstPropertyValue("uid")).toBe("espn-401856664-k3j9x0a1b2c4@sportscal.site");
  });

  it("emits a valid empty calendar when no games are published", () => {
    const ics = generateIcs([], { calendarName: "Thunder 2027-28 Schedule", now: NOW });
    const { calendar, events } = parse(ics);
    expect(events).toHaveLength(0);
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe("Thunder 2027-28 Schedule");
  });
});
