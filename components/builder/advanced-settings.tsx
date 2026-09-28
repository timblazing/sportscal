"use client";

import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";

import { DurationInput } from "@/components/builder/duration-input";
import { GameTypeOptions } from "@/components/builder/game-type-options";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import type { BuilderSettings } from "@/lib/client/storage";
import { cn } from "@/lib/utils";

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  );
}

export function AdvancedSettings({
  settings,
  defaultDuration,
  onChange,
  onResetTemplates,
  onResetOverrides,
  overrideCount,
  counts,
}: {
  settings: BuilderSettings;
  defaultDuration: number;
  onChange: (patch: Partial<BuilderSettings>) => void;
  onResetTemplates: () => void;
  onResetOverrides: () => void;
  overrideCount: number;
  counts?: Partial<Record<keyof BuilderSettings["include"], number>>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Advanced settings
        <ChevronRightIcon
          aria-hidden="true"
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t border-border px-4 py-4">
        <GameTypeOptions
          value={settings.include}
          counts={counts}
          onChange={(include) => onChange({ include })}
        />
        <div className="space-y-1.5">
          <DurationInput
            value={settings.durationMinutes}
            onChange={(durationMinutes) => onChange({ durationMinutes })}
          />
          {settings.durationMinutes !== defaultDuration && (
            <button
              type="button"
              onClick={() => onChange({ durationMinutes: defaultDuration })}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Use league default ({Math.floor(defaultDuration / 60)}h {defaultDuration % 60}m)
            </button>
          )}
        </div>
        <SwitchRow
          label="Show as busy"
          description="Games are marked free by default so they don't block your availability."
          checked={settings.busyStatus === "busy"}
          onCheckedChange={(v) => onChange({ busyStatus: v ? "busy" : "free" })}
        />
        <SwitchRow
          label="Include ESPN event link"
          description="Adds the game's ESPN page to the event's URL field — never to the description."
          checked={settings.includeEspnUrl}
          onCheckedChange={(v) => onChange({ includeEspnUrl: v })}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onResetTemplates}>
            Reset templates
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetOverrides}
            disabled={overrideCount === 0}
          >
            Reset overrides{overrideCount ? ` (${overrideCount})` : ""}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Subscription feeds rebuild from ESPN data about every 15 minutes. Calendar apps poll on
          their own schedule — Google Calendar can take up to a day to refresh.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
