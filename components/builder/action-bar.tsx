"use client";

import { DownloadIcon, Loader2Icon, RssIcon, SaveIcon } from "lucide-react";

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
    <div className={cn("flex gap-2", className)}>
      <Button
        size="lg"
        className="h-10 flex-1"
        onClick={onDownload}
        disabled={disabled || downloading}
        data-testid="download-button"
      >
        {downloading ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <DownloadIcon aria-hidden="true" />
        )}
        Download .ics
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="h-10 flex-1"
        onClick={onSubscribe}
        disabled={disabled || saving}
        data-testid="subscribe-button"
      >
        {saving ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : mode === "manage" ? (
          <SaveIcon aria-hidden="true" />
        ) : (
          <RssIcon aria-hidden="true" />
        )}
        {mode === "manage" ? "Save changes" : "Create subscription"}
      </Button>
    </div>
  );
}
