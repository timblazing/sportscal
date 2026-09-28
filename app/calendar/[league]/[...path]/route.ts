import type { NextRequest } from "next/server";

import { buildFeed } from "@/lib/calendar/feed";
import { isLeagueKey } from "@/lib/config/leagues";
import { getCalendarRow, rowToConfig, touchCalendar } from "@/lib/db/calendars";
import { findTeam } from "@/lib/espn/teams";
import { CACHE } from "@/lib/http";
import { EspnError } from "@/lib/espn/client";
import { PUBLIC_ID_RE } from "@/lib/security/tokens";
import { defaultConfig, type CalendarConfig } from "@/lib/validation/calendar-config";
import { SeasonNotFoundError, TeamNotFoundError } from "@/lib/schedule-service";

/**
 * Public subscription feeds:
 *   /calendar/{league}/{team}.ics             canonical default feed (no database)
 *   /calendar/{league}/{team}/{publicId}.ics  saved custom configuration
 */
const SLUG_RE = /^[a-z0-9-]{1,100}$/;

function text(status: number, body: string, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function resolveConfig(
  league: string,
  path: string[],
): Promise<{ config: CalendarConfig; uidScope: string } | Response> {
  if (!isLeagueKey(league)) return text(404, "Unknown league");
  const last = path[path.length - 1] ?? "";
  if (!last.endsWith(".ics")) return text(404, "Not found");
  const segments = [...path.slice(0, -1), last.slice(0, -".ics".length)];

  if (segments.length === 1) {
    const [teamSlug] = segments;
    if (!SLUG_RE.test(teamSlug)) return text(404, "Unknown team");
    const team = await findTeam(league, teamSlug);
    if (!team) return text(404, "Unknown team");
    return { config: defaultConfig(league, team), uidScope: team.id };
  }

  if (segments.length === 2) {
    const [, publicId] = segments;
    if (!PUBLIC_ID_RE.test(publicId)) return text(404, "Calendar not found");
    const row = await getCalendarRow(publicId);
    if (!row || row.league !== league) return text(404, "Calendar not found");
    touchCalendar(row).catch(() => undefined);
    return { config: rowToConfig(row), uidScope: publicId };
  }

  return text(404, "Not found");
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/calendar/[league]/[...path]">) {
  const { league, path } = await ctx.params;
  try {
    const resolved = await resolveConfig(league, path);
    if (resolved instanceof Response) return resolved;
    const feed = await buildFeed(resolved.config, resolved.uidScope);
    return new Response(feed.ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="${feed.filename}"`,
        "cache-control": CACHE.feed,
      },
    });
  } catch (error) {
    if (error instanceof TeamNotFoundError) return text(404, "Unknown team");
    if (error instanceof SeasonNotFoundError) return text(404, error.message);
    if (error instanceof EspnError) {
      // Calendar clients keep their previous copy on a failed refresh.
      return text(503, "Schedule temporarily unavailable from ESPN. Try again shortly.", {
        "retry-after": "300",
      });
    }
    console.error(error);
    return text(500, "Unable to generate calendar");
  }
}
