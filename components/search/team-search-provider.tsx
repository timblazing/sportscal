"use client";

import dynamic from "next/dynamic";
import { AlertCircleIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { LeagueLogo } from "@/components/builder/league-logo";
import { TeamLogo } from "@/components/builder/team-logo";
import { searchTeams } from "@/components/builder/team-picker";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, type CatalogTeam } from "@/lib/client/api";
import { LEAGUE_LIST, LEAGUES, type LeagueKey } from "@/lib/config/leagues";

const loadBuilder = () => import("@/components/builder/sports-calendar-builder");

const SportsCalendarBuilder = dynamic(() => loadBuilder().then((module) => module.SportsCalendarBuilder), {
  loading: () => (
    <div className="flex-1 space-y-4 px-4 py-4" aria-label="Loading calendar builder">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  ),
});

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

const MOBILE_QUERY = "(max-width: 639px)";

function subscribeToMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Below the `sm` breakpoint the builder sheet rises from the bottom instead of the right edge. */
function useIsMobile() {
  return useSyncExternalStore(
    subscribeToMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function TeamSearchProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<CatalogTeam | null>(null);
  const [seasonLabel, setSeasonLabel] = useState<string>();
  const isMobile = useIsMobile();
  const openTeamSearch = useCallback(() => {
    // Warm the builder chunk while the user is picking a team so the sheet doesn't flash a loader.
    void loadBuilder();
    setSearchOpen(true);
  }, []);
  const closeToLanding = useCallback(() => {
    setSearchOpen(false);
    setBuilderOpen(false);
    setSelectedTeam(null);
  }, []);
  const contextValue = useMemo(() => ({ openTeamSearch, closeToLanding }), [closeToLanding, openTeamSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void loadBuilder();
      setSearchOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <TeamSearchContext.Provider value={contextValue}>
      {children}
      <TeamSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(team) => {
          setSelectedTeam(team);
          setSeasonLabel(undefined);
          setSearchOpen(false);
          setBuilderOpen(true);
        }}
      />
      <Sheet open={builderOpen} onOpenChange={setBuilderOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "gap-0 overflow-hidden rounded-t-2xl p-0 data-[side=bottom]:h-[92dvh] data-[side=bottom]:data-open:slide-in-from-bottom data-[side=bottom]:data-closed:slide-out-to-bottom"
              : "w-full gap-0 p-0 sm:max-w-md"
          }
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {selectedTeam && (
            <>
              <SheetHeader className="flex-row items-center gap-3 border-b border-border p-4 pr-12">
                <TeamLogo src={selectedTeam.logo} abbreviation={selectedTeam.abbreviation} size={36} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">{selectedTeam.displayName}</SheetTitle>
                  <SheetDescription className="truncate">{seasonLabel ?? "\u00a0"}</SheetDescription>
                </div>
              </SheetHeader>
              <SportsCalendarBuilder
                key={selectedTeam.id}
                layout="sheet"
                initialLeague={selectedTeam.league}
                initialTeamSlug={selectedTeam.slug}
                initialTeams={[selectedTeam]}
                onSeasonResolved={setSeasonLabel}
              >
                <SavedCalendarsList />
              </SportsCalendarBuilder>
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
  const isMobile = useIsMobile();
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
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setQuery("");
        onOpenChange(nextOpen);
      }}
      title="Search teams and leagues"
      description="Choose a team to see its schedule and calendar settings."
      className="top-[14dvh] bg-popover ring-1 ring-foreground/20 shadow-2xl sm:max-w-xl"
      onOpenAutoFocus={(event) => {
        if (isMobile) event.preventDefault();
      }}
    >
      <Command shouldFilter={false} loop className={trimmedQuery ? "h-[min(70dvh,34rem)] bg-transparent" : "h-auto bg-transparent"}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search teams or leagues…"
        />
        <CommandList className="max-h-none flex-1 py-1">
          {!trimmedQuery ? (
            <CommandGroup className="**:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:grid-cols-3 **:[[cmdk-group-items]]:gap-1.5">
              {LEAGUE_LIST.map((league) => (
                <CommandItem
                  key={league.key}
                  value={`league:${league.key}`}
                  onSelect={() => setQuery(league.label)}
                  title={league.name}
                  className="h-28 flex-col justify-center gap-3 border border-border/60 px-2 text-center data-selected:border-border-strong sm:h-32 [&>svg:last-child]:hidden"
                >
                  <LeagueLogo league={league.key} label={league.label} size={36} />
                  <span className="w-full truncate text-sm font-medium">{league.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <>
              {visibleGroups.map(([leagueKey, teams]) => (
                <CommandGroup key={leagueKey} heading={LEAGUES[leagueKey].label}>
                  {teams.map((team) => (
                    <CommandItem
                      key={`${team.league}:${team.id}`}
                      value={`${team.league}:${team.slug}:${team.displayName}`}
                      onSelect={() => {
                        setQuery("");
                        onSelect(team);
                      }}
                      className="gap-3 py-2"
                    >
                      <TeamLogo src={team.logo} abbreviation={team.abbreviation} />
                      <span className="min-w-0 flex-1 truncate">{team.displayName}</span>
                      <span className="text-xs text-muted-foreground">{LEAGUES[team.league].label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {loading && <p className="px-3 py-5 text-center text-sm text-muted-foreground">Loading teams…</p>}
              {!loading && teamsByQuery.length === 0 && <CommandEmpty>No teams or leagues found.</CommandEmpty>}
            </>
          )}
        </CommandList>
        {failedLeagues.size > 0 && (
          <div className="flex min-h-10 items-center justify-end border-t border-border/60 px-3 text-xs text-muted-foreground">
            <button type="button" onClick={retryFailed} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <AlertCircleIcon className="size-3.5" aria-hidden="true" />
              Retry {failedLeagues.size} league{failedLeagues.size === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </Command>
    </CommandDialog>
  );
}
