"use client";

import { BellIcon, MapPinIcon, TvIcon } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useRef, useSyncExternalStore } from "react";

import { TeamLogo } from "@/components/builder/team-logo";
import { cn } from "@/lib/utils";

/** Decorative hero piece: one calendar event, blown up, that tilts toward the pointer. */

const STEELERS_GOLD = "#ffb612";
const LOGO = (abbreviation: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation}.png`;

const FALLBACK_DAY = "2026-10-05";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const subscribeNever = () => () => {};

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The Sunday at least a week out, so the game always looks upcoming. */
function gameDayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const today = new Date(year, month - 1, day);
  const sunday = new Date(year, month - 1, day + 7 + ((7 - today.getDay()) % 7));
  return sunday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function HeroEventCard({ className }: { className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dayKey = useSyncExternalStore(subscribeNever, todayKey, () => FALLBACK_DAY);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || reducedMotion || event.pointerType !== "mouse") return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    card.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
    card.style.setProperty("--rz", "0deg");
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
  };

  const untilt = () => {
    const card = cardRef.current;
    if (!card) return;
    for (const property of ["--rx", "--ry", "--rz", "--mx", "--my"]) card.style.removeProperty(property);
  };

  return (
    <div
      aria-hidden="true"
      onPointerMove={tilt}
      onPointerLeave={untilt}
      className={cn("group relative select-none [perspective:1400px]", className)}
    >
      {/* A second event peeking out behind the card, so it reads as part of a calendar. */}
      <div className="absolute inset-x-10 -top-5 bottom-10 rotate-[-7deg] rounded-2xl border border-border bg-card/60 transition-transform duration-500 ease-out group-hover:-translate-y-2 group-hover:rotate-[-9deg] motion-reduce:transition-none" />

      <div
        ref={cardRef}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border-strong bg-card p-6 shadow-[0_50px_100px_-30px_rgba(0,0,0,1)] sm:p-8",
          "[--rx:9deg] [--ry:-16deg] [--rz:4deg] [transform:rotateX(var(--rx))_rotateY(var(--ry))_rotateZ(var(--rz))] [transform-style:preserve-3d]",
          "transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:duration-200 motion-reduce:[--rx:0deg] motion-reduce:[--ry:0deg] motion-reduce:[--rz:0deg] motion-reduce:transition-none",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--mx,50%)_var(--my,0%),rgba(255,255,255,0.07),transparent_45%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="relative flex gap-4">
          <span className="w-1.5 shrink-0 self-stretch rounded-full" style={{ background: STEELERS_GOLD }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">{gameDayLabel(dayKey)}</p>
              <div className="flex shrink-0 items-center -space-x-1.5">
                <TeamLogo src={LOGO("pit")} abbreviation="PIT" size={30} className="relative z-10 rounded-full bg-background p-1 ring-1 ring-border" />
                <TeamLogo src={LOGO("bal")} abbreviation="BAL" size={30} className="rounded-full bg-background p-1 ring-1 ring-border" />
              </div>
            </div>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] whitespace-nowrap text-foreground sm:text-[2.5rem]">
              Steelers vs Ravens
            </p>
            <p className="tabular mt-2 text-base text-foreground/80 sm:text-lg">1:00 PM</p>
          </div>
        </div>

        <dl className="relative mt-7 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <DetailRow icon={<MapPinIcon />} label="Venue">Acrisure Stadium, Pittsburgh</DetailRow>
          <DetailRow icon={<TvIcon />} label="Broadcast">CBS</DetailRow>
          <DetailRow icon={<BellIcon />} label="Alert">30 minutes before</DetailRow>
        </dl>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <dt className="sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
