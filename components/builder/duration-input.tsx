"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/validation/calendar-config";

export function DurationInput({
  value,
  onChange,
  label = "Event duration",
}: {
  value: number;
  onChange: (minutes: number) => void;
  label?: string;
}) {
  const id = useId();
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  function update(h: number, m: number) {
    const total = Math.min(
      LIMITS.maxDuration,
      Math.max(LIMITS.minDuration, (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)),
    );
    onChange(total);
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">{label}</legend>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Input
            id={`${id}-h`}
            type="number"
            inputMode="numeric"
            min={0}
            max={24}
            value={hours}
            onChange={(e) => update(Number(e.target.value), minutes)}
            className="h-9 w-16 bg-card font-mono tabular dark:bg-card"
          />
          <label htmlFor={`${id}-h`} className="text-sm text-muted-foreground">
            hr
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            id={`${id}-m`}
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            step={5}
            value={minutes}
            onChange={(e) => update(hours, Math.min(59, Number(e.target.value)))}
            className="h-9 w-16 bg-card font-mono tabular dark:bg-card"
          />
          <label htmlFor={`${id}-m`} className="text-sm text-muted-foreground">
            min
          </label>
        </div>
      </div>
    </fieldset>
  );
}
