"use client";

import { LEAGUE_LIST, type LeagueKey } from "@/lib/config/leagues";
import { cn } from "@/lib/utils";

/** Segmented league control built on native radios (arrow keys work for free). */
export function LeagueSelector({
  value,
  onChange,
}: {
  value: LeagueKey;
  onChange: (league: LeagueKey) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">League</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1">
        {LEAGUE_LIST.map((league) => {
          const checked = league.key === value;
          return (
            <label
              key={league.key}
              className={cn(
                "relative flex h-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked
                  ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="league"
                value={league.key}
                checked={checked}
                onChange={() => onChange(league.key)}
                className="sr-only"
              />
              <span>{league.label}</span>
              <span className="sr-only"> — {league.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
