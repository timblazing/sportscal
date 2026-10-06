"use client";

import { PencilIcon } from "lucide-react";

import { StatusText, seasonTypeShort } from "@/components/schedule/game-labels";
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
        "flex items-start gap-3 px-4 py-3",
        muted && "opacity-55",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("min-w-0 text-sm font-medium leading-5 break-words", event.excludedBy === "override" && "line-through")}>
            {event.title}
          </h3>
          {event.overridden && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
              Override
            </Badge>
          )}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {formatEventDate(event.timing)} · {formatEventTime(event.timing)}
        </p>
        {event.location && (
          <p className="text-xs leading-5 text-muted-foreground break-words">{event.location}</p>
        )}
        {[type, game.broadcasts.join(", ")].filter(Boolean).length > 0 && (
          <p className="text-xs leading-5 text-muted-foreground">
            {[type, game.broadcasts.join(", ")].filter(Boolean).join(" · ")}
          </p>
        )}
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
