import { NextResponse } from "next/server";
import { z } from "zod";

import { canonicalizeConfig } from "@/lib/calendar-service";
import { createCalendar } from "@/lib/db/calendars";
import { errorResponse, jsonError, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { absoluteUrl, customFeedPath, managePath } from "@/lib/utils/urls";
import { calendarConfigSchema } from "@/lib/validation/calendar-config";

const bodySchema = z.object({ config: calendarConfigSchema });

/** Save an anonymous custom calendar. The edit token is returned exactly once. */
export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit("create", request.headers);
    if (!limit.allowed) {
      return jsonError(429, "rate_limited", "Too many calendars created from this network. Try again later.", {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }
    const { config } = bodySchema.parse(await readJson(request));
    const canonical = await canonicalizeConfig(config);
    const { publicId, editToken } = await createCalendar(canonical);
    const feedPath = customFeedPath(canonical.league, canonical.teamSlug, publicId);
    return NextResponse.json(
      {
        publicId,
        editToken,
        config: canonical,
        feedPath,
        feedUrl: absoluteUrl(feedPath),
        managePath: managePath(publicId),
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
