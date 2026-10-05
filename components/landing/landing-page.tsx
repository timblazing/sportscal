"use client";

import { ArrowRightIcon, CalendarDaysIcon, ChevronDownIcon, Clock3Icon, MapPinIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useTeamSearch } from "@/components/search/team-search-provider";
import { LEAGUE_LIST } from "@/lib/config/leagues";

const faqs = [
  {
    question: "Which teams can I add?",
    answer: "Search teams across the supported pro, college, and soccer leagues. The list comes from ESPN’s public schedule data.",
  },
  {
    question: "Will my calendar update when a game moves?",
    answer: "Yes. Subscribe once and your calendar app can refresh game times, venues, and newly published games automatically. A downloaded .ics file is a one-time snapshot.",
  },
  {
    question: "Which calendar apps work?",
    answer: "Any app that can subscribe to an iCalendar URL, including Apple Calendar, Google Calendar, and Outlook.",
  },
  {
    question: "Do I need an account?",
    answer: "No. You can make a team calendar without signing up. Custom calendar settings are kept in this browser so you can manage them later.",
  },
];

export function LandingPage() {
  const { openTeamSearch } = useTeamSearch();

  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:min-h-[min(720px,calc(100svh-3.5rem))] lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-20 lg:py-24">
        <div className="max-w-3xl space-y-8">
          <h1 className="text-5xl leading-[0.98] font-semibold tracking-[-0.055em] text-balance text-foreground sm:text-7xl lg:text-[5.25rem]">
            Never miss the games you follow.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Find your team, choose how its games appear, and add the schedule to the calendar app you already use.
          </p>
          <Button size="lg" onClick={openTeamSearch} className="h-11 px-5 text-sm">
            Get started
          </Button>
        </div>

        <div className="relative hidden min-h-[22rem] items-center justify-center lg:flex" aria-hidden="true">
          <div className="absolute inset-x-8 top-1/2 h-px bg-border" />
          <div className="absolute inset-y-10 left-1/2 w-px bg-border" />
          <div className="relative grid size-72 grid-cols-7 grid-rows-7 gap-2 rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/30 xl:size-80">
            <div className="col-span-7 flex items-start justify-between border-b border-border pb-4">
              <div className="space-y-1">
                <div className="h-2 w-20 rounded-full bg-muted-foreground/40" />
                <div className="h-2 w-12 rounded-full bg-muted-foreground/20" />
              </div>
              <CalendarDaysIcon className="size-5 text-muted-foreground" />
            </div>
            {Array.from({ length: 28 }, (_, index) => (
              <span
                key={index}
                className={`rounded-sm ${[3, 11, 18, 24].includes(index) ? "bg-foreground" : "bg-muted"}`}
              />
            ))}
            <div className="absolute -right-8 bottom-9 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-lg">
              <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                <CalendarDaysIcon className="size-4" />
              </span>
              <span className="text-xs font-medium">Your calendar, up to date</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Available leagues" className="border-y border-border bg-card/50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-7 gap-y-3 px-4 py-6 sm:px-6">
          <span className="mr-1 text-xs text-muted-foreground">Find your league</span>
          {LEAGUE_LIST.map((league) => (
              <span
                key={league.key}
                className="text-sm font-medium text-muted-foreground"
              >
                {league.label}
              </span>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-10 border-b border-border pb-12 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] md:gap-16">
          <h2 className="max-w-xs text-3xl leading-tight font-medium tracking-tight text-foreground sm:text-4xl">
            Your team’s schedule, without the noise.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            SportsCal turns a team schedule into a clean calendar feed. See the game time and venue at a glance, keep broadcasts or other details if you want them, and let your calendar app handle the reminders.
          </p>
        </div>

        <div className="grid divide-y divide-border pt-2 md:grid-cols-3 md:divide-x md:divide-y-0">
          <Feature icon={<CalendarDaysIcon />} title="Pick any team" text="Search across supported leagues, then choose the team you follow." />
          <Feature icon={<Clock3Icon />} title="Keep the useful details" text="Game times and venues are included. Tune event titles and extra details when you need to." />
          <Feature icon={<MapPinIcon />} title="Subscribe once" text="Use a live calendar link that follows schedule changes, or download a one-time file." />
        </div>
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] md:gap-16 md:py-24">
          <div className="space-y-3">
            <h2 className="text-3xl font-medium tracking-tight text-foreground">About SportsCal</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">A small, open-source tool for keeping up with the teams you care about.</p>
          </div>
          <div className="max-w-2xl space-y-5 text-sm leading-relaxed text-muted-foreground">
            <p>
              SportsCal gets team and schedule information from ESPN’s public data endpoints, then formats it for your calendar. It is not affiliated with ESPN or any league or team.
            </p>
            <p>
              Subscriptions refresh as schedules change. You can add one without an account, and no advertising is added to your events.
            </p>
            <a href="/about" className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4">
              How it works <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-10 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] md:gap-16">
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">Good to know</h2>
            <p className="mt-3 text-sm text-muted-foreground">A few quick answers before you get started.</p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {faqs.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="group flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-foreground marker:hidden focus-visible:outline-2 focus-visible:outline-ring">
                  {item.question}
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-12 sm:flex-row sm:items-center sm:px-6 sm:py-16">
          <div className="space-y-1">
            <h2 className="text-xl font-medium text-foreground">Ready for the next game?</h2>
            <p className="text-sm text-muted-foreground">Choose a team and add its schedule in a few steps.</p>
          </div>
          <Button onClick={openTeamSearch}>
            Get started <ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="flex gap-4 py-6 first:pl-0 md:px-6 md:py-8 first:md:pl-0 last:md:pr-0">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground [&>svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </article>
  );
}
