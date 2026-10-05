import { LEAGUES } from "@/lib/config/leagues";
import type { SportsCalGame } from "@/lib/types";
import { cn } from "@/lib/utils";

export function seasonTypeShort(game: SportsCalGame): string | undefined {
  switch (game.seasonType.normalized) {
    case "preseason":
      return LEAGUES[game.league].preseasonLabel ?? "Preseason";
    case "postseason":
      return /play-in/i.test(game.seasonType.name) ? "Play-In" : LEAGUES[game.league].postseasonLabel ?? "Postseason";
    default:
      return undefined;
  }
}

/** Home/away marker. Text, not color, carries the meaning. */
export function HomeAwayMark({ game, className }: { game: SportsCalGame; className?: string }) {
  const away = game.selectedTeamHomeAway === "away" && !game.neutralSite;
  const label = game.neutralSite ? "Neutral site" : away ? "Away" : "Home";
  return (
    <span
      title={label}
      className={cn(
        "inline-flex w-6 shrink-0 justify-center font-mono text-xs",
        away ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{away ? "@" : "vs"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function StatusText({ game }: { game: SportsCalGame }) {
  if (game.status.cancelled) return <span className="text-destructive">Canceled</span>;
  if (game.status.postponed) return <span className="text-warning">Postponed</span>;
  if (game.status.completed) return <span>Final</span>;
  if (game.status.state === "in") return <span className="text-success">Live</span>;
  return null;
}
