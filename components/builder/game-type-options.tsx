"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

type Include = CalendarConfig["include"];

const OPTIONS: { key: keyof Include; label: string }[] = [
  { key: "regularSeason", label: "Regular Season" },
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
  const baseId = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">Include</legend>
      <div className="grid gap-1 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const id = `${baseId}-${option.key}`;
          const count = counts?.[option.key];
          return (
            <label
              key={option.key}
              htmlFor={id}
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 text-sm transition-colors hover:border-border-strong"
            >
              <Checkbox
                id={id}
                checked={value[option.key]}
                onCheckedChange={(v) => onChange({ ...value, [option.key]: v === true })}
              />
              <span className="flex-1">{option.label}</span>
              {count !== undefined && (
                <span className="font-mono text-xs text-muted-foreground tabular">{count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
