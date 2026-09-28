import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LEAGUES, LEAGUE_KEYS } from "@/lib/config/leagues";
import { listSeasonOptions } from "@/lib/espn/seasons";
import { CACHE, errorResponse } from "@/lib/http";
import { loadTeamSchedule, resolveSeason } from "@/lib/schedule-service";

const querySchema = z.object({
  league: z.enum(LEAGUE_KEYS),
  team: z.string().regex(/^[a-z0-9-]{1,100}$/i),
  season: z.coerce.number().int().min(1900).max(2200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const autoSeason = await resolveSeason(query.league, { seasonMode: "auto" });
    const selection =
      query.season !== undefined && query.season !== autoSeason.espnSeason
        ? ({ seasonMode: "manual", seasonOverride: query.season } as const)
        : ({ seasonMode: "auto" } as const);

    const [schedule, seasonOptions] = await Promise.all([
      loadTeamSchedule(query.league, query.team, selection),
      listSeasonOptions(LEAGUES[query.league], autoSeason).catch(() => [
        { espnSeason: autoSeason.espnSeason, displayName: autoSeason.displayName },
      ]),
    ]);

    return NextResponse.json(
      { ...schedule, autoSeason, seasonOptions },
      { headers: { "cache-control": CACHE.schedule } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
