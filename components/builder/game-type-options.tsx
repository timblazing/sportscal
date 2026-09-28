"use client";

import { CheckIcon, PlusIcon } from "lucide-react";

import type { CalendarConfig } from "@/lib/validation/calendar-config";
import { cn } from "@/lib/utils";

type Include = CalendarConfig["include"];

const OPTIONS: { key: keyof Include; label: string }[] = [
  { key: "regularSeason", label: "Regular season" },
  { key: "postseason", label: "Postseason" },
  { key: "preseason", label: "Preseason" },
];

export function GameTypeOptions({
  value,
  counts,
  onChange,
}: {
  value: Include;
  counts?: Partial<Record<keyof Include, number>>;
  onChange: (value: Include) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">Include</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const on = value[option.key];
          const count = counts?.[option.key];
          const Icon = on ? CheckIcon : PlusIcon;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...value, [option.key]: !on })}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                on
                  ? "border-border-strong bg-secondary text-foreground"
                  : "border-border border-dashed text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {option.label}
              {count !== undefined && (
                <span className="font-mono text-xs text-muted-foreground tabular">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
