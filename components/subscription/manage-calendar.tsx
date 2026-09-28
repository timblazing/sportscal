"use client";

import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { SportsCalendarBuilder } from "@/components/builder/sports-calendar-builder";
import { CalendarUrl } from "@/components/subscription/calendar-url";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch, type CatalogTeam } from "@/lib/client/api";
import { publicUrl } from "@/lib/client/clipboard";
import {
  getStoredCalendar,
  removeStoredCalendar,
  saveStoredCalendar,
  updateStoredCalendar,
} from "@/lib/client/storage";
import { LEAGUES } from "@/lib/config/leagues";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Accept either a bare token or a full private edit link. */
function extractToken(input: string): string | null {
  const trimmed = input.trim();
  const fromHash = /#token=([A-Za-z0-9_-]+)/.exec(trimmed)?.[1];
  const candidate = fromHash ?? trimmed;
  return TOKEN_RE.test(candidate) ? candidate : null;
}

export function ManageCalendar({
  publicId,
  config,
  feedPath,
  team,
}: {
  publicId: string;
  config: CalendarConfig;
  feedPath: string;
  team?: CatalogTeam;
}) {
  const router = useRouter();
  const inputId = useId();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const teamName = team?.displayName ?? config.teamSlug;

  function rememberToken(value: string) {
    const existing = getStoredCalendar(publicId);
    if (existing) updateStoredCalendar(publicId, { editToken: value });
    else
      saveStoredCalendar({
        publicId,
        editToken: value,
        league: config.league,
        teamSlug: config.teamSlug,
        teamName,
        feedPath,
        createdAt: new Date().toISOString(),
      });
  }

  // Read the token from the URL fragment once, store it locally, and strip it
  // from the address bar so it isn't left in history or shared by accident.
  useEffect(() => {
    const fromHash = extractToken(window.location.hash);
    if (fromHash) {
      rememberToken(fromHash);
      window.history.replaceState(null, "", window.location.pathname);
    }
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser-only state */
    setToken(fromHash ?? getStoredCalendar(publicId)?.editToken ?? null);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [publicId]);

  async function remove() {
    if (!token) return;
    setDeleting(true);
    try {
      await apiFetch<void>(`/api/calendars/${publicId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      removeStoredCalendar(publicId);
      toast.success("Calendar deleted");
      router.push("/");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the calendar.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="max-w-xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manage calendar</h1>
          <p className="text-sm text-muted-foreground">
            {teamName} · {LEAGUES[config.league].label} · custom subscription
          </p>
        </div>
        <CalendarUrl url={publicUrl(feedPath)} label="Subscription URL" testId="manage-feed-url" />

        {ready && !token && (
          <Alert className="border-border bg-card">
            <KeyRoundIcon aria-hidden="true" />
            <AlertTitle>View only</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                This browser doesn&apos;t have the edit token for this calendar. The feed keeps
                working; paste your private edit link to make changes, or create a new calendar.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = extractToken(tokenInput);
                  if (!value) {
                    toast.error("That doesn't look like a valid edit link or token.");
                    return;
                  }
                  rememberToken(value);
                  setToken(value);
                  setTokenInput("");
                }}
              >
                <label htmlFor={inputId} className="sr-only">
                  Private edit link or token
                </label>
                <Input
                  id={inputId}
                  type="password"
                  autoComplete="off"
                  placeholder="Private edit link or token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="h-9 bg-card dark:bg-card"
                />
                <Button type="submit" variant="outline" className="h-9">
                  Unlock
                </Button>
              </form>
            </AlertDescription>
          </Alert>
        )}
        {ready && token && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Editing is enabled in this browser.</span>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon aria-hidden="true" />
              Delete calendar
            </Button>
          </div>
        )}
      </div>

      {ready && token && team && (
        <SportsCalendarBuilder
          initialLeague={config.league}
          saved={{ publicId, editToken: token, feedUrl: publicUrl(feedPath), config, team }}
        />
      )}
      {ready && token && !team && (
        <Alert className="max-w-xl border-border bg-card">
          <AlertTitle>Team details unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load this team from ESPN just now. Your calendar is safe — reload the page in
            a moment to edit it.
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this calendar?</DialogTitle>
            <DialogDescription>
              The subscription URL will stop working for everyone subscribed to it. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              Delete calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
