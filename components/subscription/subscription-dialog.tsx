"use client";

import { CalendarPlusIcon, CopyIcon, DownloadIcon, LinkIcon } from "lucide-react";

import { CalendarUrl } from "@/components/subscription/calendar-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/client/clipboard";
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
  onDownload,
}: {
  info: SubscriptionInfo | null;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
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
                <Button onClick={() => copyText(info.feedUrl, "Calendar URL copied")} className="h-9">
                  <CopyIcon aria-hidden="true" />
                  Copy subscription URL
                </Button>
                <Button asChild variant="outline" className="h-9">
                  <a href={toWebcal(info.feedUrl)}>
                    <CalendarPlusIcon aria-hidden="true" />
                    Subscribe with Apple Calendar
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={() => copyText(toWebcal(info.feedUrl), "webcal:// link copied")}
                >
                  <LinkIcon aria-hidden="true" />
                  Copy webcal:// link
                </Button>
                <Button variant="outline" className="h-9" onClick={onDownload}>
                  <DownloadIcon aria-hidden="true" />
                  Download current .ics
                </Button>
              </div>

              <div className="space-y-1 rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Using another calendar app?</p>
                <p>
                  <span className="text-foreground">Google Calendar:</span> Other calendars → + → From
                  URL, then paste the URL above, or{" "}
                  <a
                    href={googleCalendarSubscribeUrl(info.feedUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-2"
                  >
                    open it in Google Calendar
                  </a>
                  .
                </p>
                <p>
                  <span className="text-foreground">Outlook:</span> Add calendar → Subscribe from web.
                </p>
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
