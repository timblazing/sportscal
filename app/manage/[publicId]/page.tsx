import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ManageCalendar } from "@/components/subscription/manage-calendar";
import { protectPublic, PublicRateLimitError } from "@/lib/cache/abuse";
import { getCalendarRow, rowToConfig } from "@/lib/db/calendars";
import { withDatabase } from "@/lib/db/client";
import { findTeam } from "@/lib/espn/teams";
import { PUBLIC_ID_RE } from "@/lib/security/tokens";
import { customFeedPath } from "@/lib/utils/urls";

export const metadata: Metadata = {
  title: "Manage calendar",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function TooManyRequests() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-xl font-semibold">Too many requests</h1>
      <p className="mt-2 text-muted-foreground">Please wait a minute and reload this page.</p>
    </div>
  );
}

export default async function ManagePage({ params }: PageProps<"/manage/[publicId]">) {
  const { publicId } = await params;
  if (!PUBLIC_ID_RE.test(publicId)) notFound();
  // Same per-client and global admission as /api/calendars/[publicId], before any database work.
  try {
    await protectPublic({ headers: await headers() }, "management");
  } catch (error) {
    if (error instanceof PublicRateLimitError) return <TooManyRequests />;
    throw error;
  }
  const row = await withDatabase(() => getCalendarRow(publicId));
  if (!row) notFound();
  const config = rowToConfig(row);
  const team = await findTeam(config.league, config.teamId).catch(() => undefined);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ManageCalendar
        publicId={publicId}
        config={config}
        feedPath={customFeedPath(config.league, config.teamSlug, publicId)}
        team={team}
      />
    </div>
  );
}
