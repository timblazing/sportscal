"use client";

import { ArrowUpRightIcon, PlusIcon } from "lucide-react";

import { HeroEventCard } from "@/components/landing/hero-event-card";
import { LogoLoop } from "@/components/landing/logo-loop";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useTeamSearch } from "@/components/search/team-search-provider";
import { LEAGUE_LIST } from "@/lib/config/leagues";
import { GITHUB_URL } from "@/lib/config/site";

const faqs = [
  {
    question: "Which teams can I add?",
    answer: "Any team in the supported pro, college, and soccer leagues. The team list comes from ESPN’s public schedule data.",
  },
  {
    question: "Will my calendar update when a game moves?",
    answer: "Yes. Subscribe once and your calendar app picks up new start times, venues, and newly scheduled games on its next refresh. A downloaded .ics file is a one-time snapshot.",
  },
  {
    question: "Which calendar apps work?",
    answer: "Any app that can subscribe to an iCalendar URL, including Apple Calendar, Google Calendar, and Outlook.",
  },
  {
    question: "What if a start time hasn’t been announced?",
    answer: "The game shows as an all-day event until a time is published, then turns into a timed event in place, without creating a duplicate. Canceled games stay on the calendar marked as canceled.",
  },
  {
    question: "Where does the schedule data come from?",
    answer: "ESPN’s public schedule data, refreshed about every 15 minutes. SportsCal isn’t affiliated with ESPN or any league or team.",
  },
  {
    question: "Do I need an account?",
    answer: "No. There are no accounts, email addresses, or ad trackers. Custom calendar settings are kept in this browser, along with a private link you can use to edit the calendar later.",
  },
  {
    question: "Does it cost anything?",
    answer: "No. SportsCal is free and open source, and it never adds ads or promotions to your events.",
  },
];

export function LandingPage() {
  const { openTeamSearch } = useTeamSearch();

  return (
    <div className="overflow-x-clip">
      <section className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_70%_at_75%_45%,black,transparent)] bg-size-[22px_22px]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:gap-14 pt-12 pb-16 sm:px-6 sm:pt-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:gap-12 lg:pt-20 lg:pb-28">
          <div className="max-w-3xl">
            <h1 className="text-[clamp(2.25rem,11.5vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.06em] text-balance text-foreground sm:text-7xl xl:text-[clamp(4.5rem,6.4vw,5.25rem)]">
              Never miss the <br className="sm:max-xl:hidden" />
              games you follow.
            </h1>
            <p className="mt-6 max-w-lg text-base sm:mt-7 leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              Pick a team, choose what each game shows, and subscribe in the calendar app you already use. When a game moves, your calendar moves with it.
            </p>
            <div className="mt-8 flex flex-wrap sm:mt-9 items-center gap-3">
              <Button size="lg" onClick={openTeamSearch} className="h-11 gap-3 rounded-full px-6 text-sm sm:pr-2 sm:pl-5">
                Find your team
                <Kbd className="hidden rounded-full bg-primary-foreground/10 px-2 text-primary-foreground/70 sm:inline-flex">⌘K</Kbd>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-11 rounded-full px-4 text-sm text-muted-foreground">
                <a href="#about">How it works</a>
              </Button>
            </div>
          </div>

          <HeroEventCard className="mx-auto w-full max-w-[30rem] pt-4 xl:mr-4" />
        </div>
      </section>

      <section aria-label="Supported leagues" className="border-y border-border">
        <div className="mx-auto flex max-w-7xl items-center">
          <p className="hidden shrink-0 border-r border-border py-7 pr-8 pl-6 text-sm leading-snug text-muted-foreground md:block">
            Every team across
            <br />
            <span className="text-foreground">{LEAGUE_LIST.length} leagues</span>
          </p>
          <div className="min-w-0 flex-1 py-7">
            <LogoLoop />
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-32">
        <div className="grid gap-8 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] md:gap-16">
          <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">About</h2>
          <div className="max-w-2xl">
            <p className="text-xl leading-snug font-medium tracking-tight text-pretty text-foreground sm:text-[1.625rem]">
              SportsCal turns a team’s schedule into a calendar feed you subscribe to once.{" "}
              <span className="text-muted-foreground">
                Every game lands next to the rest of your week with the time and venue up front, and it stays current when a start time moves or a playoff game is added.
              </span>
            </p>
            <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Keep events minimal or add broadcasts, final scores, and your own titles. Schedules come from ESPN’s public data. SportsCal is a small open-source project, isn’t affiliated with ESPN or any league or team, and never needs an account.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="group mt-8 inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              View the source on GitHub
              <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-7xl scroll-mt-20 border-t border-border px-4 py-16 sm:px-6 sm:py-32">
        <div className="grid gap-8 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] md:gap-16">
          <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">FAQ</h2>
          <div className="divide-y divide-border">
            {faqs.map((item) => (
              <details key={item.question} className="faq-item group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 group-first:pt-0 text-base font-medium text-foreground transition-colors marker:hidden hover:text-foreground/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <PlusIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:text-foreground"
                    aria-hidden="true"
                  />
                </summary>
                <p className="max-w-xl pb-6 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
