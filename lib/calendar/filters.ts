import type { SportsCalGame } from "@/lib/types";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

export function isSeasonTypeIncluded(game: SportsCalGame, include: CalendarConfig["include"]): boolean {
  switch (game.seasonType.normalized) {
    case "preseason":
      return include.preseason;
    case "postseason":
      return include.postseason;
    case "regular":
    case "other":
      return include.regularSeason;
  }
}

/** Games that belong in the calendar before per-game exclusions are applied. */
export function filterGamesBySeasonType(
  games: SportsCalGame[],
  include: CalendarConfig["include"],
): SportsCalGame[] {
  return games.filter((g) => isSeasonTypeIncluded(g, include));
}
