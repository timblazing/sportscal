import { SportsCalendarBuilder } from "@/components/builder/sports-calendar-builder";
import { SavedCalendarsList } from "@/components/subscription/saved-calendars-list";
import { isLeagueKey, type LeagueKey } from "@/lib/config/leagues";
import { getTeams, type CatalogTeam } from "@/lib/espn/teams";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const league: LeagueKey = isLeagueKey(params.league) ? params.league : "nfl";
  const team =
    typeof params.team === "string" && /^[a-z0-9-]{1,100}$/.test(params.team) ? params.team : undefined;

  // Server-render the default team list so the picker is usable immediately.
  // If ESPN is unreachable the client fetch shows a retryable error instead.
  let initialTeams: CatalogTeam[] | undefined;
  try {
    initialTeams = await getTeams(league);
  } catch {
    initialTeams = undefined;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          Clean sports schedules for your calendar.
        </h1>
        <p className="max-w-xl text-sm text-pretty text-muted-foreground">
          Pick a team, tune how games appear, then download an .ics file or subscribe to a feed that
          stays up to date. No accounts, no ads in your events.
        </p>
      </div>
      <SportsCalendarBuilder
        initialLeague={league}
        initialTeamSlug={team}
        initialTeams={initialTeams}
      />
      <SavedCalendarsList />
    </div>
  );
}
