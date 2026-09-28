import { TeamLogo } from "@/components/builder/team-logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogTeam } from "@/lib/client/api";
import type { ResolvedSeason } from "@/lib/types";

const STATUS: Record<ResolvedSeason["status"], string> = {
  upcoming: "upcoming",
  active: "in progress",
  completed: "completed",
};

export function TeamSummary({
  team,
  season,
  gameCount,
  children,
}: {
  team: CatalogTeam;
  season?: ResolvedSeason;
  gameCount?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <TeamLogo src={team.logo} abbreviation={team.abbreviation} size={40} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
          {team.displayName}
        </h2>
        {season ? (
          <p className="text-sm text-muted-foreground" data-testid="season-summary">
            <span className="font-mono tabular">{season.displayName}</span> season ·{" "}
            {STATUS[season.status]}
            {gameCount !== undefined && (
              <>
                {" "}
                · <span className="font-mono tabular">{gameCount}</span> game{gameCount === 1 ? "" : "s"}
              </>
            )}
          </p>
        ) : (
          <Skeleton className="h-5 w-48" />
        )}
        {children}
      </div>
    </div>
  );
}
