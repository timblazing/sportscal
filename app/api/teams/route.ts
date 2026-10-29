import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { publicResponse } from "@/lib/cache/response";
import { protectPublic } from "@/lib/cache/abuse";

import { LEAGUE_KEYS } from "@/lib/config/leagues";
import { getTeams } from "@/lib/espn/teams";
import { CACHE, errorResponse } from "@/lib/http";

const querySchema = z.object({
  league: z.enum(LEAGUE_KEYS),
  all: z.enum(["0", "1"]).optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return await publicResponse(request, `teams/${query.league}/${query.all === "1" ? "all" : "primary"}`, 3600, async () => {
      await protectPublic(request, "read");
      const teams = await getTeams(query.league, { includeAll: query.all === "1" });
      return NextResponse.json({ teams }, { headers: { "cache-control": CACHE.teams } });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function HEAD(request: NextRequest) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
