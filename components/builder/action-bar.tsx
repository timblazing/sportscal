"use client";

import { CalendarPlusIcon, Loader2Icon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ActionBar({
  onDownload,
  onSubscribe,
  downloading,
  saving,
  disabled,
  mode,
  className,
}: {
  onDownload: () => void;
  onSubscribe: () => void;
  downloading: boolean;
  saving: boolean;
  disabled: boolean;
  mode: "create" | "manage";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Button
        size="lg"
        className="h-10 w-full"
        onClick={onSubscribe}
        disabled={disabled || saving}
        data-testid="subscribe-button"
      >
        {saving ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : mode === "manage" ? (
          <SaveIcon aria-hidden="true" />
        ) : (
          <CalendarPlusIcon aria-hidden="true" />
        )}
        {mode === "manage" ? "Save changes" : "Add to calendar"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Or{" "}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          onClick={onDownload}
          disabled={disabled || downloading}
          data-testid="download-button"
        >
          {downloading ? "preparing download…" : "download a one-time .ics file"}
        </button>{" "}
        — it won&apos;t update when the schedule changes.
      </p>
    </div>
  );
}
