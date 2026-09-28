"use client";

import { CopyIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/client/clipboard";

export function CalendarUrl({
  url,
  label = "Calendar URL",
  copyMessage = "Calendar URL copied",
  testId,
}: {
  url: string;
  label?: string;
  copyMessage?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          id={id}
          readOnly
          value={url}
          data-testid={testId}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => copyText(url, copyMessage)}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          <CopyIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
