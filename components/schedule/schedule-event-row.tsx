"use client";

import { PencilIcon } from "lucide-react";

import { HomeAwayMark, StatusText, seasonTypeShort } from "@/components/schedule/game-labels";
import { TeamLogo } from "@/components/builder/team-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatEventDate, formatEventTime } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const EXCLUDED_LABEL = {
  override: "Excluded from calendar",
  seasonType: "Not included (game type filter)",
  unscheduled: "Date not announced — added once ESPN schedules it",
} as const;

function hasStatus(game: CalendarEvent["game"]): boolean {
  return Boolean(game.status.cancelled || game.status.postponed || game.status.completed || game.status.state === "in");
}

export function ScheduleEventRow({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}) {
  const { game } = event;
  const opponent = game.selectedTeamHomeAway === "home" ? game.awayTeam : game.homeTeam;
  const type = seasonTypeShort(game);
  const muted = !event.included;

  return (
    <li
      data-testid="schedule-row"
      data-game-id={game.id}
      data-included={event.included}
      className={cn(
        "grid grid-cols-[4.75rem_1fr_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[5.5rem_4.5rem_1fr_auto] sm:items-center",
        muted && "opacity-55",
      )}
    >
      <div className="font-mono text-xs leading-5 text-foreground tabular">
        {formatEventDate(event.timing)}
        <span className="block text-muted-foreground sm:hidden">{formatEventTime(event.timing)}</span>
      </div>
      <div className="hidden font-mono text-xs text-muted-foreground tabular sm:block">
        {formatEventTime(event.timing)}
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <HomeAwayMark game={game} />
          <TeamLogo src={opponent.logo} abbreviation={opponent.abbreviation} size={16} />
          <span className={cn("truncate", event.excludedBy === "override" && "line-through")}>
            {opponent.displayName}
          </span>
          {event.overridden && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
              Override
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <span className="text-foreground/80">{event.title}</span>
          {[type, game.broadcasts.join(", "), game.venue?.name].filter(Boolean).map((part) => (
            <span key={part}> · {part}</span>
          ))}
        </p>
        {(hasStatus(game) || event.excludedBy) && (
          <p className="text-xs text-muted-foreground">
            <StatusText game={game} />
            {hasStatus(game) && event.excludedBy && " · "}
            {event.excludedBy && EXCLUDED_LABEL[event.excludedBy]}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(event)}
        className="size-9 text-muted-foreground hover:text-foreground"
        aria-label={`Edit ${formatEventDate(event.timing)} game against ${opponent.displayName}`}
      >
        <PencilIcon className="size-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}
