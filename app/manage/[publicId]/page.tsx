import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ManageCalendar } from "@/components/subscription/manage-calendar";
import { getCalendarRow, rowToConfig } from "@/lib/db/calendars";
import { findTeam } from "@/lib/espn/teams";
import { PUBLIC_ID_RE } from "@/lib/security/tokens";
import { customFeedPath } from "@/lib/utils/urls";

export const metadata: Metadata = {
  title: "Manage calendar",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManagePage({ params }: PageProps<"/manage/[publicId]">) {
  const { publicId } = await params;
  if (!PUBLIC_ID_RE.test(publicId)) notFound();
  const row = await getCalendarRow(publicId);
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
