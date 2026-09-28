"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { TeamLogo } from "@/components/builder/team-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogTeam } from "@/lib/client/api";
import type { LeagueKey } from "@/lib/config/leagues";
import { cn } from "@/lib/utils";

interface TeamGroup {
  label: string;
  teams: CatalogTeam[];
}

/** Group teams by conference/division using ESPN metadata. */
export function groupTeams(league: LeagueKey, teams: CatalogTeam[]): TeamGroup[] {
  const groups = new Map<string, { order: string; teams: CatalogTeam[] }>();
  for (const team of teams) {
    let label: string;
    let order: string;
    if (league === "ncaaf") {
      const conf = team.conference?.name;
      if (team.tier === "primary") {
        label = conf ?? "FBS";
        order = `0-${label === "Independents" ? "zzz" : label}`;
      } else if (team.tier === "secondary") {
        label = conf ? `FCS · ${conf}` : "FCS";
        order = `1-${label}`;
      } else {
        label = "Other divisions";
        order = "2";
      }
    } else {
      const conf = team.conference?.shortName ?? team.conference?.name ?? "";
      const division = team.division?.name ?? "";
      label =
        league === "nba" && division && conf
          ? `${conf} · ${division}`
          : division || conf || "Teams";
      order = `${conf}-${division}`;
    }
    const group = groups.get(label) ?? { order, teams: [] };
    group.teams.push(team);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => a.order.localeCompare(b.order))
    .map(([label, g]) => ({
      label,
      teams: g.teams.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
}

export function TeamPicker({
  league,
  teams,
  loading,
  selected,
  onSelect,
  showAll,
  onShowAllChange,
}: {
  league: LeagueKey;
  teams: CatalogTeam[] | undefined;
  loading: boolean;
  selected?: CatalogTeam;
  onSelect: (team: CatalogTeam) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const showAllId = useId();
  const groups = useMemo(() => (teams ? groupTeams(league, teams) : []), [league, teams]);

  return (
    <div className="space-y-2">
      <span id={labelId} className="block text-sm font-medium text-foreground">
        Team
      </span>
      {loading && !teams ? (
        <Skeleton className="h-10 w-full rounded-lg" aria-label="Loading teams" />
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-labelledby={labelId}
              data-testid="team-picker"
              className="h-10 w-full justify-between bg-card px-3 font-normal dark:bg-card"
            >
              {selected ? (
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogo src={selected.logo} abbreviation={selected.abbreviation} />
                  <span className="truncate text-foreground">{selected.displayName}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Search teams…</span>
              )}
              <ChevronsUpDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) min-w-72 p-0"
            align="start"
          >
            <Command
              filter={(value, search, keywords) => {
                const haystack = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
                const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
                return terms.every((t) => haystack.includes(t)) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Team, school, mascot, or abbreviation" />
              <CommandList className="max-h-80">
                <CommandEmpty>No teams found.</CommandEmpty>
                {groups.map((group) => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group.teams.map((team) => (
                      <CommandItem
                        key={team.id}
                        value={team.slug}
                        keywords={[
                          team.displayName,
                          team.location,
                          team.name,
                          team.shortName,
                          team.abbreviation,
                          team.conference?.name ?? "",
                        ]}
                        onSelect={() => {
                          onSelect(team);
                          setOpen(false);
                        }}
                      >
                        <TeamLogo
                          src={team.tier === "other" ? undefined : team.logo}
                          abbreviation={team.abbreviation}
                        />
                        <span className="truncate">{team.displayName}</span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {team.abbreviation}
                        </span>
                        <CheckIcon
                          aria-hidden="true"
                          className={cn(
                            "size-4",
                            selected?.id === team.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
      {league === "ncaaf" && (
        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox
            id={showAllId}
            checked={showAll}
            onCheckedChange={(v) => onShowAllChange(v === true)}
          />
          <label htmlFor={showAllId} className="text-xs text-muted-foreground">
            Show all teams <span className="text-muted-foreground/70">(FCS and other divisions)</span>
          </label>
        </div>
      )}
    </div>
  );
}
