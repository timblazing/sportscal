import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LEAGUE_KEYS } from "@/lib/config/leagues";
import { CACHE, errorResponse } from "@/lib/http";
import { loadTeamSchedule, resolveSeason } from "@/lib/schedule-service";

const querySchema = z.object({
  league: z.enum(LEAGUE_KEYS),
  team: z.string().regex(/^[a-z0-9-]{1,100}$/i),
});

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const autoSeason = await resolveSeason(query.league, { seasonMode: "auto" });
    const schedule = await loadTeamSchedule(query.league, query.team, { seasonMode: "auto" });

    return NextResponse.json(
      { ...schedule, autoSeason },
      { headers: { "cache-control": CACHE.schedule } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
