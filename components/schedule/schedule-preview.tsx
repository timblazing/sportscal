"use client";

import { CalendarClockIcon, CalendarX2Icon, RefreshCwIcon } from "lucide-react";

import { ScheduleEventRow } from "@/components/schedule/schedule-event-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarEvent } from "@/lib/calendar/events";

export function ScheduleSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading schedule" className="space-y-4">
      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="hidden h-4 w-14 sm:block" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="size-7" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert className="border-border bg-card">
      <CalendarX2Icon aria-hidden="true" />
      <AlertTitle>Schedule unavailable</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message} Your settings are kept.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptySchedule({ teamName, upcoming }: { teamName: string; upcoming: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center"
      data-testid="empty-schedule"
    >
      <CalendarClockIcon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        {upcoming
          ? "The upcoming schedule hasn't been published yet."
          : `ESPN doesn't list any games for ${teamName} this season.`}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {upcoming
          ? "Subscription feeds fill in automatically once ESPN adds games, so you can subscribe now."
          : "Try another season from advanced settings."}
      </p>
    </div>
  );
}

export function SchedulePreview({
  events,
  onEdit,
  between,
}: {
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  /** Settings rendered above the schedule. */
  between?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {between}

      <section aria-labelledby="schedule-heading" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="schedule-heading" className="text-sm font-medium text-foreground">
            Schedule
          </h2>
        </div>
        <ul className="@container divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {events.map((event) => (
            <ScheduleEventRow key={event.gameId} event={event} onEdit={onEdit} />
          ))}
        </ul>
      </section>
    </div>
  );
}
