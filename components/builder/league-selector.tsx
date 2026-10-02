"use client";

import { useId } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAGUE_LIST, LEAGUES, isLeagueKey, type LeagueKey } from "@/lib/config/leagues";
import { cn } from "@/lib/utils";

/** League dropdown (Radix Select: keyboard and screen-reader support built in). */
export function LeagueSelector({
  value,
  onChange,
}: {
  value: LeagueKey;
  onChange: (league: LeagueKey) => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <span id={labelId} className="block text-sm font-medium text-foreground">
        League
      </span>
      <Select value={value} onValueChange={(next) => isLeagueKey(next) && onChange(next)}>
        <SelectTrigger
          aria-labelledby={labelId}
          data-testid="league-selector"
          className={cn(
            "h-10 w-full rounded-lg border-border bg-card px-3 text-base font-medium text-foreground data-[size=default]:h-10 md:text-sm",
            "hover:border-border-strong",
          )}
        >
          <SelectValue>{LEAGUES[value].label}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
          {LEAGUE_LIST.map((league) => (
            <SelectItem key={league.key} value={league.key} className="py-2 pl-3">
              <span className="font-medium">{league.label}</span>
              <span className="text-muted-foreground">{league.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
