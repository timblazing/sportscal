import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LEAGUE_KEYS } from "@/lib/config/leagues";
import { getTeams } from "@/lib/espn/teams";
import { CACHE, errorResponse } from "@/lib/http";

const querySchema = z.object({
  league: z.enum(LEAGUE_KEYS),
  all: z.enum(["0", "1"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const teams = await getTeams(query.league, { includeAll: query.all === "1" });
    return NextResponse.json({ teams }, { headers: { "cache-control": CACHE.teams } });
  } catch (error) {
    return errorResponse(error);
  }
}
