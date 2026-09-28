import type { Metadata } from "next";
import Link from "next/link";

import { GITHUB_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "About",
  description: "How SportsCal builds its calendars, where the data comes from, and how feeds update.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">About SportsCal</h1>
        <p className="text-sm text-muted-foreground">
          A small open-source utility for clean sports calendars: team, venue, time — and nothing you
          didn&apos;t ask for.
        </p>
      </div>

      <Section title="Data source">
        <p>
          Schedules, teams, venues and broadcast networks come from ESPN&apos;s public, undocumented
          API endpoints. SportsCal is not affiliated with or endorsed by ESPN or any league or team.
          If ESPN changes or removes data, calendars reflect that on the next refresh.
        </p>
      </Section>

      <Section title="Downloads vs. subscriptions">
        <p>
          A download is a snapshot of the schedule right now. A subscription URL is regenerated from
          current ESPN data (cached for about 15 minutes), so new start times, venue changes and
          postseason games appear automatically. How often your calendar app checks the URL is up to
          the app.
        </p>
      </Section>

      <Section title="Seasons">
        <p>
          Feeds pick the season automatically: the current season while it&apos;s underway, the
          upcoming one once ESPN publishes it, and otherwise the most recent season. When a new season
          begins the same URL switches to it, so the feed always represents one season. Your calendar
          app may keep events it already imported from the previous season. Calendars pinned to a
          specific season never move.
        </p>
      </Section>

      <Section title="TBD start times">
        <p>
          Games with a date but no start time appear as all-day events. When ESPN publishes the time,
          the same event (same UID) becomes a timed event — no duplicates. Games without a date
          aren&apos;t added until ESPN schedules them. Canceled games stay on the calendar marked as
          canceled.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          No accounts, no email addresses, no ad trackers. Custom calendars store only their settings
          and a hash of a private edit token. The token lives in your browser and in the private edit
          link — keep that link if you want to change the calendar later.
        </p>
      </Section>

      <Section title="Open source">
        <p>
          The code is on{" "}
          <a href={GITHUB_URL} className="text-foreground underline underline-offset-2" target="_blank" rel="noreferrer">
            GitHub
          </a>
          . Issues and pull requests are welcome.{" "}
          <Link href="/" className="text-foreground underline underline-offset-2">
            Build a calendar →
          </Link>
        </p>
      </Section>
    </div>
  );
}
