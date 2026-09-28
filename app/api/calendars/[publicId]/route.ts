import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { canonicalizeConfig } from "@/lib/calendar-service";
import {
  authorizeCalendar,
  deleteCalendar,
  getCalendarRow,
  rowToConfig,
  updateCalendar,
} from "@/lib/db/calendars";
import { bearerToken, errorResponse, jsonError, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { PUBLIC_ID_RE } from "@/lib/security/tokens";
import { absoluteUrl, customFeedPath } from "@/lib/utils/urls";
import { calendarConfigSchema } from "@/lib/validation/calendar-config";

const bodySchema = z.object({ config: calendarConfigSchema });
type Ctx = RouteContext<"/api/calendars/[publicId]">;

const notFound = () => jsonError(404, "not_found", "This saved calendar doesn't exist.");
const unauthorized = () =>
  jsonError(403, "unauthorized", "The edit token for this calendar is missing or incorrect.");

/** Public, read-only view of a saved configuration (never includes the token hash). */
export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { publicId } = await ctx.params;
    if (!PUBLIC_ID_RE.test(publicId)) return notFound();
    const row = await getCalendarRow(publicId);
    if (!row) return notFound();
    const config = rowToConfig(row);
    const feedPath = customFeedPath(config.league, config.teamSlug, publicId);
    return NextResponse.json(
      {
        publicId,
        config,
        feedPath,
        feedUrl: absoluteUrl(feedPath),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { publicId } = await ctx.params;
    if (!PUBLIC_ID_RE.test(publicId)) return notFound();
    const token = bearerToken(request);
    if (!token) return unauthorized();
    const limit = await checkRateLimit("update", request.headers);
    if (!limit.allowed) {
      return jsonError(429, "rate_limited", "Too many updates. Try again later.", {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }
    // Authorize before looking at the body so unauthorized callers learn nothing.
    const auth = await authorizeCalendar(publicId, token);
    if (!auth.ok) return auth.reason === "not_found" ? notFound() : unauthorized();
    const { config } = bodySchema.parse(await readJson(request));
    if (config.league !== auth.value.league) {
      return jsonError(400, "invalid_request", "A saved calendar's league can't be changed.");
    }
    const canonical = await canonicalizeConfig(config);
    const result = await updateCalendar(publicId, token, canonical);
    if (!result.ok) return result.reason === "not_found" ? notFound() : unauthorized();
    const feedPath = customFeedPath(result.value.league, result.value.teamSlug, publicId);
    return NextResponse.json(
      { publicId, config: result.value, feedPath, feedUrl: absoluteUrl(feedPath) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { publicId } = await ctx.params;
    if (!PUBLIC_ID_RE.test(publicId)) return notFound();
    const token = bearerToken(request);
    if (!token) return unauthorized();
    const result = await deleteCalendar(publicId, token);
    if (!result.ok) return result.reason === "not_found" ? notFound() : unauthorized();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
