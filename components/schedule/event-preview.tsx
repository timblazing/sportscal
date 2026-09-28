import { ClockIcon, MapPinIcon, TvIcon } from "lucide-react";

import { seasonTypeShort } from "@/components/schedule/game-labels";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatDuration, formatEventTime, timingDate } from "@/lib/client/format";

/** A calendar-event-like card for one rendered game. */
export function EventPreview({ event, showBroadcast }: { event: CalendarEvent; showBroadcast: boolean }) {
  const date = timingDate(event.timing);
  const type = seasonTypeShort(event.game);
  const month = date ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(date) : "TBD";
  const day = date ? new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date) : "–";
  const weekday = date ? new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date) : "";

  return (
    <article className="flex gap-3 rounded-lg border border-border bg-card p-3" data-testid="event-preview">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border bg-secondary py-1.5 text-center">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{month}</span>
        <span className="font-mono text-lg leading-tight font-semibold tabular">{day}</span>
        <span className="text-[10px] text-muted-foreground">{weekday}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3
          className={
            event.status === "CANCELLED"
              ? "text-sm font-medium break-words text-muted-foreground line-through"
              : "text-sm font-medium break-words text-foreground"
          }
        >
          {event.title}
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono tabular">
            <ClockIcon className="size-3" aria-hidden="true" />
            {event.timing.kind === "timed"
              ? `${formatEventTime(event.timing)} · ${formatDuration(event.durationMinutes)}`
              : "All day · time TBD"}
          </span>
          {type && <span>{type}</span>}
          {event.status === "CANCELLED" && <span className="text-destructive">Canceled</span>}
          {event.status === "TENTATIVE" && <span className="text-warning">Postponed</span>}
        </p>
        {event.location && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="break-words">{event.location}</span>
          </p>
        )}
        {showBroadcast && event.game.broadcasts.length > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TvIcon className="size-3" aria-hidden="true" />
            {event.game.broadcasts.join(", ")}
          </p>
        )}
        {event.description && (
          <p className="border-t border-border pt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">
            {event.description}
          </p>
        )}
      </div>
    </article>
  );
}
