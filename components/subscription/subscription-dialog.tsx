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
import { cn } from "@/lib/utils";
import { googleCalendarSubscribeUrl, toWebcal } from "@/lib/utils/urls";

/** Apple devices get Apple Calendar first; everyone else gets Google first. */
function isApplePlatform() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

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
  const apple = isApplePlatform();
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

              <div className={cn("grid gap-2 sm:grid-cols-2", !apple && "[&>*:first-child]:order-last")}>
                <Button asChild variant={apple ? "default" : "outline"} className="h-10 px-4">
                  <a href={toWebcal(info.feedUrl)}>
                    <CalendarPlusIcon aria-hidden="true" />
                    Apple Calendar
                  </a>
                </Button>
                <Button asChild variant={apple ? "outline" : "default"} className="h-10 px-4">
                  <a href={googleCalendarSubscribeUrl(info.feedUrl)} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon aria-hidden="true" />
                    Google Calendar
                  </a>
                </Button>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Google Calendar only adds subscriptions on the web — on a phone, open this page on a
                  computer, or copy the URL and add it at calendar.google.com.
                </p>
                <p>Using Outlook or another app? Copy the URL above and add it as a subscribed calendar.</p>
              </div>

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
