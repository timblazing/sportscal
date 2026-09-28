"use client";

import { useId, useState } from "react";

import { DurationInput } from "@/components/builder/duration-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatEventDate } from "@/lib/client/format";
import { LIMITS, type GameOverride } from "@/lib/validation/calendar-config";

export interface OverrideTarget {
  event: CalendarEvent;
  /** The event as the global templates render it, without any override. */
  base: Pick<CalendarEvent, "title" | "description" | "location" | "durationMinutes">;
  override?: GameOverride;
}

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OverrideForm({
  target,
  onSave,
  onClose,
}: {
  target: OverrideTarget;
  onSave: (override: GameOverride | undefined) => void;
  onClose: () => void;
}) {
  const id = useId();
  const o = target.override ?? {};
  const [title, setTitle] = useState(o.title ?? "");
  const [description, setDescription] = useState(o.description ?? "");
  const [location, setLocation] = useState(o.location ?? "");
  const [customDuration, setCustomDuration] = useState(o.durationMinutes !== undefined);
  const [duration, setDuration] = useState(o.durationMinutes ?? target.base.durationMinutes);
  const [included, setIncluded] = useState(!o.excluded);

  const game = target.event.game;
  const opponent = game.selectedTeamHomeAway === "home" ? game.awayTeam : game.homeTeam;

  function save() {
    const next: GameOverride = {};
    if (title.trim()) next.title = title.trim();
    if (description.trim()) next.description = description;
    if (location.trim()) next.location = location.trim();
    if (customDuration) next.durationMinutes = duration;
    if (!included) next.excluded = true;
    onSave(Object.keys(next).length ? next : undefined);
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit game</DialogTitle>
        <DialogDescription>
          {formatEventDate(target.event.timing, "long")} ·{" "}
          {game.selectedTeamHomeAway === "away" && !game.neutralSite ? "@" : "vs"}{" "}
          {opponent.displayName}. Blank fields keep using your global templates.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
          <label htmlFor={`${id}-include`} className="text-sm">
            Include this game in the calendar
          </label>
          <Switch id={`${id}-include`} checked={included} onCheckedChange={setIncluded} />
        </div>
        <Field id={`${id}-title`} label="Title">
          <Input
            id={`${id}-title`}
            value={title}
            maxLength={LIMITS.overrideTitle}
            placeholder={target.base.title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-card dark:bg-card"
          />
        </Field>
        <Field id={`${id}-description`} label="Description">
          <Textarea
            id={`${id}-description`}
            value={description}
            rows={3}
            maxLength={LIMITS.overrideDescription}
            placeholder={target.base.description || "Blank"}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-card dark:bg-card"
          />
        </Field>
        <Field id={`${id}-location`} label="Location">
          <Input
            id={`${id}-location`}
            value={location}
            maxLength={LIMITS.overrideLocation}
            placeholder={target.base.location || "Blank"}
            onChange={(e) => setLocation(e.target.value)}
            className="bg-card dark:bg-card"
          />
        </Field>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-duration`}
              checked={customDuration}
              onCheckedChange={(v) => setCustomDuration(v === true)}
            />
            <label htmlFor={`${id}-duration`} className="text-sm">
              Custom duration for this game
            </label>
          </div>
          {customDuration && <DurationInput label="Duration" value={duration} onChange={setDuration} />}
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onSave(undefined);
            onClose();
          }}
          disabled={!target.override}
        >
          Reset overrides
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function EventOverrideDialog({
  target,
  onOpenChange,
  onSave,
}: {
  target: OverrideTarget | null;
  onOpenChange: (open: boolean) => void;
  onSave: (gameId: string, override: GameOverride | undefined) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {target && (
          <OverrideForm
            key={target.event.gameId}
            target={target}
            onSave={(o) => onSave(target.event.gameId, o)}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
