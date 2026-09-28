import { buildFeed } from "@/lib/calendar/feed";
import { CACHE, errorResponse, readJson } from "@/lib/http";
import { calendarConfigSchema } from "@/lib/validation/calendar-config";
import { z } from "zod";

const bodySchema = z.object({ config: calendarConfigSchema });

/** Snapshot download of the current builder configuration. Nothing is stored. */
export async function POST(request: Request) {
  try {
    const { config } = bodySchema.parse(await readJson(request));
    const feed = await buildFeed(config, config.teamId);
    return new Response(feed.ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${feed.filename}"`,
        "cache-control": CACHE.none,
        "x-sportscal-event-count": String(feed.eventCount),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
