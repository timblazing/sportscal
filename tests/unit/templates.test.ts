import { describe, expect, it } from "vitest";

import {
  gameTemplateValues,
  renderTemplate,
  unknownVariables,
} from "@/lib/calendar/templates";
import { soonersGames, steelersGames, thunderPlayoffGames } from "../helpers";

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    expect(renderTemplate("{team} {homeAwaySymbol} {opponent}", { team: "Oklahoma", homeAwaySymbol: "vs", opponent: "Texas" })).toBe(
      "Oklahoma vs Texas",
    );
  });

  it("renders missing and unknown variables as empty strings, never undefined/null", () => {
    const out = renderTemplate("{team} {nope} {broadcast}", { team: "Steelers", broadcast: undefined });
    expect(out).toBe("Steelers");
    expect(out).not.toMatch(/undefined|null/);
  });

  it("cleans double spaces, empty brackets and dangling separators", () => {
    expect(renderTemplate("{team}  vs  {opponent} ({broadcast})", { team: "A", opponent: "B" })).toBe("A vs B");
    expect(renderTemplate("{week} · {team}", { team: "A" })).toBe("A");
    expect(renderTemplate("{team} - {note}", { team: "A" })).toBe("A");
    expect(renderTemplate("{team} | {broadcast} | {venue}", { team: "A", venue: "V" })).toBe("A | V");
  });

  it("keeps multiline descriptions and trims empty lines", () => {
    const tpl = "TV: {broadcast}\n{note}\n\n\n\nVenue: {venue}";
    expect(renderTemplate(tpl, { broadcast: "CBS", venue: "Acrisure Stadium" })).toBe(
      "TV: CBS\n\nVenue: Acrisure Stadium",
    );
  });

  it("does not evaluate anything", () => {
    expect(renderTemplate("{constructor} {toString} {__proto__} ${1+1}", {})).toBe("{__proto__} ${1+1}");
  });

  it("reports unknown variables", () => {
    expect(unknownVariables("{team} {foo} {bar} {foo}")).toEqual(["foo", "bar"]);
  });
});

describe("gameTemplateValues", () => {
  it("uses vs for home games and @ for away games", () => {
    const games = steelersGames();
    const home = games.find((g) => g.id === "401872658")!; // Falcons at Steelers
    const away = games.find((g) => g.id === "401873002")!; // Steelers at Buccaneers
    expect(renderTemplate("{team} {homeAwaySymbol} {opponent}", gameTemplateValues(home))).toBe("Steelers vs Falcons");
    expect(renderTemplate("{team} {homeAwaySymbol} {opponent}", gameTemplateValues(away))).toBe("Steelers @ Buccaneers");
    expect(gameTemplateValues(away).homeAway).toBe("Away");
    expect(gameTemplateValues(away).broadcast).toBe("CBS");
  });

  it("produces the spec's college example and treats neutral sites as vs", () => {
    const texas = soonersGames().find((g) => g.id === "401856717")!;
    expect(texas.neutralSite).toBe(true);
    const values = gameTemplateValues(texas);
    expect(renderTemplate("{team} {homeAwaySymbol} {opponent}", values)).toBe("Oklahoma vs Texas");
    expect(values.homeAway).toBe("Neutral");
    expect(values.venue).toBe("Cotton Bowl");
  });

  it("exposes notes, results and TBD times", () => {
    const game7 = thunderPlayoffGames().find((g) => g.id === "401873203")!;
    const v = gameTemplateValues(game7);
    expect(v.note).toBe("West Finals - Game 7");
    expect(v.result).toBe("L 103-111");
    expect(v.seasonType).toBe("Postseason");
    expect(v.season).toBe("2025-26");

    const tbd = soonersGames().find((g) => g.id === "401856763")!;
    expect(gameTemplateValues(tbd).time).toBe("TBD");
  });
});
