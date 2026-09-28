"use client";

import { CalendarPlusIcon, ExternalLinkIcon } from "lucide-react";

import { CalendarUrl } from "@/components/subscription/calendar-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { googleCalendarSubscribeUrl, toWebcal } from "@/lib/utils/urls";

export interface SubscriptionInfo {
  kind: "canonical" | "custom";
  feedUrl: string;
  calendarName: string;
  /** Present for custom calendars created in this browser. */
  manageUrl?: string;
}

export function SubscriptionDialog({
  info,
  onOpenChange,
}: {
  info: SubscriptionInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={info !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="subscription-dialog">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle>Subscribe to {info.calendarName}</DialogTitle>
              <DialogDescription>
                {info.kind === "canonical"
                  ? "This is the default feed for this team. It updates automatically when the schedule changes."
                  : "Your custom calendar is saved. The feed updates automatically when the schedule changes."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <CalendarUrl url={info.feedUrl} testId="subscription-url" />

              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild className="h-10 px-4">
                  <a href={toWebcal(info.feedUrl)}>
                    <CalendarPlusIcon aria-hidden="true" />
                    Apple Calendar
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-10 px-4">
                  <a href={googleCalendarSubscribeUrl(info.feedUrl)} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon aria-hidden="true" />
                    Google Calendar
                  </a>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Using Outlook or another app? Copy the URL above and add it as a subscribed calendar.
              </p>

              {info.manageUrl && (
                <div className="space-y-2 border-t border-border pt-4">
                  <CalendarUrl
                    url={info.manageUrl}
                    label="Private edit link"
                    copyMessage="Edit link copied"
                    testId="manage-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Keep this link to change the calendar later — there are no accounts, and it&apos;s
                    saved in this browser too. Don&apos;t share it; anyone with it can edit the calendar.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
