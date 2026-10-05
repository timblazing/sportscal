"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { TeamLogo } from "@/components/builder/team-logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogTeam } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 50;
const TIER_RANK: Record<CatalogTeam["tier"], number> = { primary: 0, secondary: 1, other: 2 };

/**
 * Match every search term against a team's names, ranking exact abbreviation
 * and name-prefix hits first, then top-tier teams (FBS before FCS and below).
 */
export function searchTeams(teams: CatalogTeam[], query: string): CatalogTeam[] {
  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { team: CatalogTeam; score: number }[] = [];
  for (const team of teams) {
    const haystack = [
      team.displayName,
      team.location,
      team.name,
      team.shortName,
      team.abbreviation,
      team.slug,
      team.conference?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!terms.every((t) => haystack.includes(t))) continue;

    const name = team.displayName.toLowerCase();
    let score = TIER_RANK[team.tier] * 10;
    if (team.abbreviation.toLowerCase() === q) score -= 40;
    else if (name.startsWith(q)) score -= 30;
    else if (name.split(/\s+/).some((word) => word.startsWith(terms[0]))) score -= 20;
    scored.push({ team, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.team.displayName.localeCompare(b.team.displayName))
    .slice(0, MAX_RESULTS)
    .map((s) => s.team);
}

export function TeamPicker({
  teams,
  loading,
  selected,
  onSelect,
  groupByConference = false,
}: {
  teams: CatalogTeam[] | undefined;
  loading: boolean;
  selected?: CatalogTeam;
  onSelect: (team: CatalogTeam) => void;
  groupByConference?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // `null` while not typing: the field shows the selected team's name.
  const [query, setQuery] = useState<string | null>(null);
  const results = useMemo(() => (teams && query ? searchTeams(teams, query) : []), [teams, query]);
  const open = query !== null && query.trim() !== "";
  const showSelected = query === null && selected;

  const conferenceGroups = useMemo(() => {
    const groups = new Map<string, CatalogTeam[]>();
    for (const team of results) {
      const name = team.conference?.name ?? "Other teams";
      const group = groups.get(name) ?? [];
      group.push(team);
      groups.set(name, group);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }, [results]);

  function renderTeam(team: CatalogTeam) {
    return (
      <CommandPrimitive.Item
        key={team.id}
        value={team.slug}
        onSelect={() => choose(team)}
        className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none select-none data-[selected=true]:bg-muted"
      >
        <TeamLogo src={team.tier === "other" ? undefined : team.logo} abbreviation={team.abbreviation} />
        <span className="truncate">{team.displayName}</span>
      </CommandPrimitive.Item>
    );
  }

  function choose(team: CatalogTeam) {
    onSelect(team);
    setQuery(null);
    inputRef.current?.blur();
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        Team
      </label>
      {loading && !teams ? (
        <Skeleton className="h-10 w-full rounded-lg" aria-label="Loading teams" />
      ) : (
        <CommandPrimitive shouldFilter={false} loop className="relative">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              {showSelected ? (
                <TeamLogo src={selected.logo} abbreviation={selected.abbreviation} />
              ) : (
                <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
            <CommandPrimitive.Input
              id={inputId}
              ref={inputRef}
              data-testid="team-picker"
              placeholder="Search teams…"
              autoComplete="off"
              spellCheck={false}
              value={query ?? selected?.displayName ?? ""}
              onValueChange={setQuery}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setQuery(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery(null);
                  e.currentTarget.blur();
                }
              }}
              className={cn(
                "h-10 w-full rounded-lg border border-border bg-card pr-3 pl-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground md:text-sm",
                "hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            />
          </div>
          <CommandPrimitive.List
            hidden={!open}
            // Keep focus in the input so clicking a result doesn't blur-reset first.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-80 scroll-py-1 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
          >
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              No teams found.
            </CommandPrimitive.Empty>
            {groupByConference ? conferenceGroups.map(([name, teams]) => (
              <CommandPrimitive.Group
                key={name}
                heading={name}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {teams.map(renderTeam)}
              </CommandPrimitive.Group>
            )) : results.map(renderTeam)}
          </CommandPrimitive.List>
        </CommandPrimitive>
      )}
    </div>
  );
}
