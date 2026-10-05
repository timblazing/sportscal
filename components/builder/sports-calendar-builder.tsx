"use client";

import { ChevronRightIcon, InfoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ActionBar } from "@/components/builder/action-bar";
import { AdvancedSettings } from "@/components/builder/advanced-settings";
import { LeagueSelector } from "@/components/builder/league-selector";
import { TeamPicker } from "@/components/builder/team-picker";
import { TeamSummary } from "@/components/builder/team-summary";
import { TemplateEditor } from "@/components/builder/template-editor";
import { EventOverrideDialog, type OverrideTarget } from "@/components/schedule/event-override-dialog";
import {
  EmptySchedule,
  ScheduleError,
  SchedulePreview,
  ScheduleSkeleton,
} from "@/components/schedule/schedule-preview";
import {
  SubscriptionDialog,
  type SubscriptionInfo,
} from "@/components/subscription/subscription-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { defaultSettings, mergeSettings, useBuilderSettings } from "@/hooks/use-builder-settings";
import { seedJson, useJson } from "@/hooks/use-json";
import { buildCalendarEvents, type CalendarEvent } from "@/lib/calendar/events";
import {
  TEMPLATE_VARIABLES,
  calendarTemplateValues,
  gameTemplateValues,
  renderTemplate,
} from "@/lib/calendar/templates";
import {
  ApiError,
  apiFetch,
  downloadIcs,
  type CatalogTeam,
  type SavedCalendarResponse,
  type ScheduleResponse,
} from "@/lib/client/api";
import { publicUrl } from "@/lib/client/clipboard";
import {
  loadBuilderState,
  saveBuilderState,
  saveStoredCalendar,
  type BuilderSettings,
} from "@/lib/client/storage";
import { LEAGUES, isLeagueKey, type LeagueKey } from "@/lib/config/leagues";
import { canonicalFeedPath, managePath } from "@/lib/utils/urls";
import {
  DEFAULT_TEMPLATES,
  defaultTemplates,
  LIMITS,
  isDefaultConfig,
  type CalendarConfig,
} from "@/lib/validation/calendar-config";

const CALENDAR_NAME_VARIABLES = TEMPLATE_VARIABLES.filter((v) =>
  ["team", "teamFull", "teamShort", "teamAbbr", "league", "season"].includes(v.name),
);

export interface SavedCalendarContext {
  publicId: string;
  editToken: string | null;
  feedUrl: string;
}

export interface SportsCalendarBuilderProps {
  initialLeague?: LeagueKey;
  initialTeamSlug?: string;
  /** Ignore the last-used builder state for an explicit landing-page reset. */
  resetBuilder?: boolean;
  /** Primary team list for `initialLeague`, rendered on the server. */
  initialTeams?: CatalogTeam[];
  /** Manage mode: editing an existing saved calendar. League and team are fixed. */
  saved?: SavedCalendarContext & { config: CalendarConfig; team: CatalogTeam };
}

function teamsUrl(league: LeagueKey) {
  return `/api/teams?league=${league}&all=1`;
}

export function SportsCalendarBuilder({
  initialLeague = "nfl",
  initialTeamSlug,
  resetBuilder = false,
  initialTeams,
  saved,
}: SportsCalendarBuilderProps) {
  const mode = saved ? "manage" : "create";
  const [league, setLeague] = useState<LeagueKey>(saved?.config.league ?? initialLeague);
  const [teamSlug, setTeamSlug] = useState<string | undefined>(saved?.config.teamSlug ?? initialTeamSlug);
  const { settings, setSettings, update, setOverride, resetForTeam } = useBuilderSettings(
    league,
    saved ? savedSettings(saved.config) : undefined,
  );

  useState(() => {
    if (initialTeams) seedJson(teamsUrl(initialLeague), { teams: initialTeams });
  });

  // Restore the last session's selection and templates (convenience only).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || saved) return;
    restored.current = true;
    const stored = resetBuilder ? {} : loadBuilderState();
    const storedLeague = isLeagueKey(stored.league) ? stored.league : undefined;
    const nextLeague = initialTeamSlug ? initialLeague : (storedLeague ?? initialLeague);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    if (!resetBuilder && !initialTeamSlug && storedLeague) {
      setLeague(storedLeague);
      if (stored.teamSlug) setTeamSlug(stored.teamSlug);
    }
    if (stored.settings) setSettings(mergeSettings(nextLeague, stored.settings));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [saved, initialLeague, initialTeamSlug, resetBuilder, setSettings]);

  useEffect(() => {
    if (saved || !restored.current) return;
    saveBuilderState({
      league,
      teamSlug,
      settings: {
        include: settings.include,
        templates: settings.templates,
        busyStatus: settings.busyStatus,
        includeEspnUrl: settings.includeEspnUrl,
      },
    });
    const params = new URLSearchParams();
    params.set("league", league);
    if (teamSlug) params.set("team", teamSlug);
    window.history.replaceState(null, "", `/?${params.toString()}`);
  }, [saved, league, teamSlug, settings]);

  // --- Data ------------------------------------------------------------------
  const teams = useJson<{ teams: CatalogTeam[] }>(saved ? null : teamsUrl(league));
  const selectedTeam = useMemo(
    () => saved?.team ?? teams.data?.teams.find((t) => t.slug === teamSlug),
    [saved, teams.data, teamSlug],
  );

  const schedule = useJson<ScheduleResponse>(
    selectedTeam ? `/api/schedule?league=${league}&team=${selectedTeam.slug}` : null,
  );
  const scheduleData = schedule.data?.team.id === selectedTeam?.id ? schedule.data : undefined;

  const config: CalendarConfig | undefined = selectedTeam
    ? { league, teamId: selectedTeam.id, teamSlug: selectedTeam.slug, ...settings }
    : undefined;

  const events = useMemo<CalendarEvent[]>(
    () => (scheduleData ? buildCalendarEvents(scheduleData.games, settings, "preview") : []),
    [scheduleData, settings],
  );

  const exampleGame = useMemo(() => {
    const firstIncluded = events.find((e) => e.included) ?? events[0];
    return firstIncluded?.game;
  }, [events]);
  const exampleValues = exampleGame ? gameTemplateValues(exampleGame) : undefined;

  const counts = useMemo(() => {
    const games = scheduleData?.games ?? [];
    return {
      preseason: games.filter((g) => g.seasonType.normalized === "preseason").length,
      regularSeason: games.filter((g) => g.seasonType.normalized === "regular" || g.seasonType.normalized === "other").length,
      postseason: games.filter((g) => g.seasonType.normalized === "postseason").length,
    };
  }, [scheduleData]);

  // --- Actions ---------------------------------------------------------------
  function changeLeague(next: LeagueKey) {
    if (next === league) return;
    setLeague(next);
    setTeamSlug(undefined);
    resetForTeam(next, true);
  }

  function selectTeam(team: CatalogTeam) {
    if (team.slug === teamSlug) return;
    setTeamSlug(team.slug);
    resetForTeam(league, false);
  }

  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  function openOverride(event: CalendarEvent) {
    const [base] = buildCalendarEvents([event.game], { ...settings, overrides: {} }, "preview");
    setOverrideTarget({ event, base, override: settings.overrides[event.gameId] });
  }

  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (!config) return;
    setDownloading(true);
    try {
      const { count } = await downloadIcs(config);
      toast.success("Download ready", { description: `${count} game${count === 1 ? "" : "s"} in the file.` });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const calendarName =
    selectedTeam && scheduleData
      ? renderTemplate(settings.templates.calendarName, calendarTemplateValues(selectedTeam, scheduleData.season.displayName))
      : (selectedTeam?.displayName ?? "");

  async function subscribe() {
    if (!config || !selectedTeam) return;
    if (saved) {
      if (!saved.editToken) {
        toast.error("This browser doesn't have the edit token for this calendar.");
        return;
      }
      setSaving(true);
      try {
        const result = await apiFetch<SavedCalendarResponse>(`/api/calendars/${saved.publicId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${saved.editToken}` },
          body: JSON.stringify({ config }),
        });
        toast.success("Calendar saved");
        setSubscription({ kind: "custom", feedUrl: publicUrl(result.feedPath), calendarName });
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Couldn't save changes. Try again.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (isDefaultConfig(config)) {
      setSubscription({
        kind: "canonical",
        feedUrl: publicUrl(canonicalFeedPath(league, selectedTeam.slug)),
        calendarName,
      });
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<SavedCalendarResponse & { editToken: string }>("/api/calendars", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      saveStoredCalendar({
        publicId: result.publicId,
        editToken: result.editToken,
        league,
        teamSlug: result.config.teamSlug,
        teamName: selectedTeam.displayName,
        feedPath: result.feedPath,
        createdAt: new Date().toISOString(),
      });
      toast.success("Calendar saved");
      setSubscription({
        kind: "custom",
        feedUrl: publicUrl(result.feedPath),
        calendarName,
        manageUrl: `${publicUrl(managePath(result.publicId))}#token=${result.editToken}`,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the calendar. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const overrideCount = Object.keys(settings.overrides).length;
  const showBroadcast = Object.values(settings.templates).some((t) => t.includes("{broadcast}"));
  const leagueConfig = LEAGUES[league];

  // --- Render ----------------------------------------------------------------
  const controls = (
    <div className="space-y-6">
      {mode === "create" && <LeagueSelector value={league} onChange={changeLeague} />}
      {mode === "create" && (
        <div className="space-y-2">
        <TeamPicker
        groupByConference={leagueConfig.teamGrouping.kind === "conferenceStandings"}
          key={league}
          teams={teams.data?.teams}
          loading={teams.status === "loading" || teams.status === "idle"}
          selected={selectedTeam}
          onSelect={selectTeam}
        />
        {leagueConfig.note && <p className="text-xs text-muted-foreground">{leagueConfig.note}</p>}
        </div>
      )}
      {teams.status === "error" && !teams.data && (
        <ScheduleError message="We couldn't load teams from ESPN. Try again in a moment." onRetry={teams.retry} />
      )}

      {selectedTeam && (
        <>
          <Separator />
          <TeamSummary team={selectedTeam} season={scheduleData?.season} gameCount={scheduleData?.games.length} />
          <FormattingOptions>
            <TemplateEditor
              label="Event title"
              help="Shown as the event name in your calendar."
              value={settings.templates.title}
              defaultValue={defaultTemplates(league).title}
              maxLength={LIMITS.title}
              onChange={(title) => update({ templates: { ...settings.templates, title } })}
              preview={exampleValues ? renderTemplate(settings.templates.title, exampleValues) : undefined}
              testId="template-title"
            />
            <TemplateEditor
              label="Description"
              help="Blank by default. Add only what you want — e.g. {broadcast} or {note}."
              value={settings.templates.description}
              defaultValue={DEFAULT_TEMPLATES.description}
              maxLength={LIMITS.description}
              multiline
              placeholder="Blank by default"
              onChange={(description) => update({ templates: { ...settings.templates, description } })}
              preview={exampleValues ? renderTemplate(settings.templates.description, exampleValues) : undefined}
              testId="template-description"
            />
            <TemplateEditor
              label="Location"
              help="Defaults to the venue ESPN lists for each game."
              value={settings.templates.location}
              defaultValue={DEFAULT_TEMPLATES.location}
              maxLength={LIMITS.location}
              onChange={(location) => update({ templates: { ...settings.templates, location } })}
              preview={exampleValues ? renderTemplate(settings.templates.location, exampleValues) : undefined}
              testId="template-location"
            />
            <TemplateEditor
              label="Calendar name"
              help="The name your calendar app shows for this calendar."
              value={settings.templates.calendarName}
              defaultValue={defaultTemplates(league).calendarName}
              maxLength={LIMITS.calendarName}
              variables={CALENDAR_NAME_VARIABLES}
              onChange={(calendarName) => update({ templates: { ...settings.templates, calendarName } })}
              preview={scheduleData ? calendarName : undefined}
              testId="template-calendar-name"
            />
          </FormattingOptions>
          <AdvancedSettings
            settings={settings}
            defaultDuration={leagueConfig.defaultDurationMinutes}
            onChange={update}
            onResetTemplates={() => {
              update({ templates: defaultTemplates(league) });
              toast("Templates reset");
            }}
            onResetOverrides={() => {
              update({ overrides: {} });
              toast("Override reset");
            }}
            overrideCount={overrideCount}
            counts={scheduleData ? counts : undefined}
            gameTypes={leagueConfig.gameTypes}
            preseasonLabel={leagueConfig.preseasonLabel}
            postseasonLabel={leagueConfig.postseasonLabel}
          />
        </>
      )}
    </div>
  );

  const preview = selectedTeam && (
    <div className="space-y-4">
      <div className="hidden space-y-2 lg:block">
        <ActionBar
          mode={mode}
          onDownload={download}
          onSubscribe={subscribe}
          downloading={downloading}
          saving={saving}
          disabled={!scheduleData}
        />
      </div>

      {scheduleData?.season.pendingNextSeason && (
        <Alert className="border-border bg-card">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            ESPN hasn&apos;t published {selectedTeam.shortName}&apos;s next season schedule yet. Showing the
            completed {scheduleData.season.displayName} season — subscriptions switch automatically once
            it&apos;s out.
          </AlertDescription>
        </Alert>
      )}

      {schedule.status === "error" && !scheduleData ? (
        <ScheduleError message={schedule.error.message} onRetry={schedule.retry} />
      ) : !scheduleData ? (
        <ScheduleSkeleton />
      ) : scheduleData.games.length === 0 ? (
        <EmptySchedule
          teamName={selectedTeam.displayName}
          upcoming={scheduleData.season.status === "upcoming"}
        />
      ) : (
        <>
          {schedule.status === "error" && (
            <ScheduleError message={schedule.error.message} onRetry={schedule.retry} />
          )}
          <SchedulePreview events={events} showBroadcast={showBroadcast} onEdit={openOverride} />
        </>
      )}
    </div>
  );

  return (
    <>
      <div
        className={
          selectedTeam
            ? "grid gap-10 pb-32 lg:pb-0 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:gap-14"
            : "max-w-xl"
        }
      >
        <section aria-label="Calendar settings">{controls}</section>
        {preview && (
          <section aria-label="Calendar preview" className="lg:sticky lg:top-20 lg:self-start">
            {preview}
          </section>
        )}
      </div>

      {selectedTeam && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">
          <ActionBar
            mode={mode}
            onDownload={download}
            onSubscribe={subscribe}
            downloading={downloading}
            saving={saving}
            disabled={!scheduleData}
          />
        </div>
      )}

      <EventOverrideDialog
        target={overrideTarget}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
        onSave={(gameId, override) => {
          setOverride(gameId, override);
          if (!override && overrideTarget?.override) toast("Override reset");
        }}
      />
      <SubscriptionDialog
        info={subscription}
        onOpenChange={(open) => !open && setSubscription(null)}
      />
    </>
  );
}

function savedSettings(config: CalendarConfig): BuilderSettings {
  return {
    ...defaultSettings(config.league),
    // Saved calendars created before the current-season-only UI may still
    // contain a pinned season. Editing them brings them back to the live season.
    seasonMode: "auto",
    seasonOverride: undefined,
    include: config.include,
    templates: config.templates,
    durationMinutes: config.durationMinutes,
    busyStatus: config.busyStatus,
    includeEspnUrl: config.includeEspnUrl,
    overrides: config.overrides,
  };
}

function FormattingOptions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Formatting options
        <ChevronRightIcon
          aria-hidden="true"
          className={`size-4 text-muted-foreground transition-transform${open ? " rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t border-border px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
