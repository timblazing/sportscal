"use client";

import dynamic from "next/dynamic";
import { Command as CommandPrimitive } from "cmdk";
import { AlertCircleIcon, CalendarDaysIcon, SearchIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { TeamLogo } from "@/components/builder/team-logo";
import { searchTeams } from "@/components/builder/team-picker";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, type CatalogTeam } from "@/lib/client/api";
import { LEAGUE_LIST, LEAGUES, type LeagueKey } from "@/lib/config/leagues";

const SportsCalendarBuilder = dynamic(
  () => import("@/components/builder/sports-calendar-builder").then((module) => module.SportsCalendarBuilder),
  { loading: () => <div className="h-72 animate-pulse rounded-lg bg-muted" aria-label="Loading calendar builder" /> },
);

const SavedCalendarsList = dynamic(
  () => import("@/components/subscription/saved-calendars-list").then((module) => module.SavedCalendarsList),
);

type TeamSearchContextValue = { openTeamSearch: () => void; closeToLanding: () => void };
const TeamSearchContext = createContext<TeamSearchContextValue | null>(null);

export function useTeamSearch() {
  const context = useContext(TeamSearchContext);
  if (!context) throw new Error("useTeamSearch must be used within TeamSearchProvider");
  return context;
}

export function TeamSearchProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<CatalogTeam | null>(null);
  const openTeamSearch = useCallback(() => setSearchOpen(true), []);
  const closeToLanding = useCallback(() => {
    setSearchOpen(false);
    setBuilderOpen(false);
    setSelectedTeam(null);
  }, []);
  const contextValue = useMemo(() => ({ openTeamSearch, closeToLanding }), [closeToLanding, openTeamSearch]);

  return (
    <TeamSearchContext.Provider value={contextValue}>
      {children}
      <TeamSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(team) => {
          setSelectedTeam(team);
          setSearchOpen(false);
          setBuilderOpen(true);
        }}
      />
      <Sheet open={builderOpen} onOpenChange={setBuilderOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-0 sm:inset-x-auto sm:inset-y-0 sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:h-dvh sm:max-h-none sm:w-[min(92vw,80rem)] sm:max-w-none sm:rounded-none sm:border-t-0 sm:border-l sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:top-0 sm:data-[side=bottom]:right-0 sm:data-[side=bottom]:bottom-auto sm:data-[side=bottom]:left-auto sm:data-[side=bottom]:h-dvh sm:data-[side=bottom]:border-t-0 sm:data-[side=bottom]:data-open:slide-in-from-right-10 sm:data-[side=bottom]:data-closed:slide-out-to-right-10"
        >
          {selectedTeam && (
            <>
              <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 pr-14 backdrop-blur-sm sm:px-7">
                <div className="flex items-center gap-3">
                  <TeamLogo src={selectedTeam.logo} abbreviation={selectedTeam.abbreviation} />
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate text-base">{selectedTeam.displayName}</SheetTitle>
                    <SheetDescription>{LEAGUES[selectedTeam.league].label} schedule and calendar settings</SheetDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={openTeamSearch}>
                    <SearchIcon aria-hidden="true" />
                    Change team
                  </Button>
                </div>
              </SheetHeader>
              <div className="min-h-0 px-4 py-5 sm:px-7 sm:py-7">
                <SportsCalendarBuilder
                  key={selectedTeam.id}
                  initialLeague={selectedTeam.league}
                  initialTeamSlug={selectedTeam.slug}
                  initialTeams={[selectedTeam]}
                />
                <SavedCalendarsList />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </TeamSearchContext.Provider>
  );
}

function TeamSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (team: CatalogTeam) => void;
}) {
  const [query, setQuery] = useState("");
  const [teamsByLeague, setTeamsByLeague] = useState<Partial<Record<LeagueKey, CatalogTeam[]>>>({});
  const [loadingLeagues, setLoadingLeagues] = useState<Set<LeagueKey>>(() => new Set());
  const [failedLeagues, setFailedLeagues] = useState<Set<LeagueKey>>(() => new Set());
  const [retryKey, setRetryKey] = useState(0);
  const requested = useRef(new Set<LeagueKey>());

  useEffect(() => {
    if (!open) return;
    const missing = LEAGUE_LIST.filter((league) => !requested.current.has(league.key));
    if (missing.length === 0) return;

    missing.forEach((league) => requested.current.add(league.key));
    setLoadingLeagues((current) => new Set([...current, ...missing.map((league) => league.key)]));
    void Promise.all(
      missing.map(async ({ key }) => {
        try {
          const result = await apiFetch<{ teams: CatalogTeam[] }>(`/api/teams?league=${key}&all=1`);
          setTeamsByLeague((current) => ({ ...current, [key]: result.teams }));
          setFailedLeagues((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        } catch {
          requested.current.delete(key);
          setFailedLeagues((current) => new Set(current).add(key));
        } finally {
          setLoadingLeagues((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
      }),
    );
  }, [open, retryKey]);

  const allTeams = useMemo(() => Object.values(teamsByLeague).flatMap((teams) => teams ?? []), [teamsByLeague]);
  const trimmedQuery = query.trim().toLocaleLowerCase();
  const matchingLeagues = useMemo(
    () => {
      if (!trimmedQuery) return [];
      const terms = trimmedQuery.split(/\s+/).filter(Boolean);
      return LEAGUE_LIST.filter((league) => {
          const label = `${league.label} ${league.name}`.toLocaleLowerCase();
          return terms.every((term) => label.includes(term));
      });
    },
    [trimmedQuery],
  );
  const teamsByQuery = useMemo(() => {
    if (!trimmedQuery) return [];
    if (matchingLeagues.length) {
      return matchingLeagues.flatMap((league) => teamsByLeague[league.key] ?? []);
    }
    return searchTeams(allTeams, trimmedQuery);
  }, [allTeams, matchingLeagues, teamsByLeague, trimmedQuery]);
  const visibleGroups = useMemo(() => {
    const groups = new Map<LeagueKey, CatalogTeam[]>();
    for (const team of teamsByQuery) {
      const group = groups.get(team.league) ?? [];
      group.push(team);
      groups.set(team.league, group);
    }
    return [...groups].sort(([a], [b]) => LEAGUES[a].label.localeCompare(LEAGUES[b].label));
  }, [teamsByQuery]);

  const loading = loadingLeagues.size > 0;
  const retryFailed = () => {
    failedLeagues.forEach((league) => requested.current.delete(league));
    setRetryKey((value) => value + 1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setQuery("");
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="top-[12dvh] max-h-[76dvh] max-w-2xl translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:top-1/2 sm:max-w-2xl sm:-translate-y-1/2">
        <DialogHeader className="sr-only">
          <DialogTitle>Search teams and leagues</DialogTitle>
          <DialogDescription>Choose a team to see its schedule and calendar settings.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} loop className="h-[min(76dvh,42rem)] rounded-2xl">
          <div className="border-b border-border p-3 sm:p-4">
            <CommandInput
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search teams or leagues…"
              className="h-11 text-base"
            />
          </div>
          <CommandList className="max-h-none flex-1 px-2 py-2">
            {!trimmedQuery ? (
              <CommandGroup heading="Browse a league">
                {LEAGUE_LIST.map((league) => (
                  <CommandPrimitive.Item
                    key={league.key}
                    value={`league:${league.key}`}
                    onSelect={() => setQuery(league.label)}
                    className="flex cursor-default items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-muted"
                  >
                    <CalendarDaysIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{league.label}</span>
                    <span className="truncate text-muted-foreground">{league.name}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandGroup>
            ) : (
              <>
                {visibleGroups.map(([leagueKey, teams]) => (
                  <CommandGroup key={leagueKey} heading={LEAGUES[leagueKey].label}>
                    {teams.map((team) => (
                      <CommandPrimitive.Item
                        key={`${team.league}:${team.id}`}
                        value={`${team.league}:${team.slug}:${team.displayName}`}
                        onSelect={() => {
                          setQuery("");
                          onSelect(team);
                        }}
                        className="flex cursor-default items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-muted"
                      >
                        <TeamLogo src={team.logo} abbreviation={team.abbreviation} />
                        <span className="min-w-0 flex-1 truncate">{team.displayName}</span>
                        <span className="text-xs text-muted-foreground">{LEAGUES[team.league].label}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandGroup>
                ))}
                {loading && <p className="px-3 py-5 text-center text-sm text-muted-foreground">Loading teams…</p>}
                {!loading && teamsByQuery.length === 0 && <CommandEmpty>No teams or leagues found.</CommandEmpty>}
              </>
            )}
          </CommandList>
          <div className="flex min-h-10 items-center justify-between border-t border-border px-4 text-xs text-muted-foreground">
            <span>{loading ? "Loading available teams" : "Search across all available leagues"}</span>
            {failedLeagues.size > 0 && (
              <button type="button" onClick={retryFailed} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <AlertCircleIcon className="size-3.5" aria-hidden="true" />
                Retry {failedLeagues.size} league{failedLeagues.size === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
