"use client";

import { useId } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResolvedSeason, SeasonOption } from "@/lib/types";

const STATUS_LABEL: Record<ResolvedSeason["status"], string> = {
  upcoming: "upcoming",
  active: "in progress",
  completed: "completed",
};

/**
 * Deliberately secondary: automatic season detection is the normal path and
 * this only offers a pinned season for people who want one.
 */
export function SeasonSelector({
  autoSeason,
  options,
  seasonMode,
  seasonOverride,
  onChange,
}: {
  autoSeason?: ResolvedSeason;
  options: SeasonOption[];
  seasonMode: "auto" | "manual";
  seasonOverride?: number;
  onChange: (value: { seasonMode: "auto" | "manual"; seasonOverride?: number }) => void;
}) {
  const id = useId();
  const value = seasonMode === "manual" && seasonOverride !== undefined ? String(seasonOverride) : "auto";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={id}>Season</label>
      <Select
        value={value}
        onValueChange={(v) =>
          onChange(v === "auto" ? { seasonMode: "auto" } : { seasonMode: "manual", seasonOverride: Number(v) })
        }
      >
        <SelectTrigger id={id} size="sm" className="h-7 border-border text-xs" data-testid="season-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="auto">
            Auto — {autoSeason ? `${autoSeason.displayName} (${STATUS_LABEL[autoSeason.status]})` : "current"}
          </SelectItem>
          {options.length > 0 && <SelectSeparator />}
          {options.map((o) => (
            <SelectItem key={o.espnSeason} value={String(o.espnSeason)}>
              {o.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
