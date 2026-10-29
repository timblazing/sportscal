import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { publicResponse } from "@/lib/cache/response";
import { protectPublic } from "@/lib/cache/abuse";

import { LEAGUE_KEYS } from "@/lib/config/leagues";
import { CACHE, errorResponse } from "@/lib/http";
import { loadTeamSchedule } from "@/lib/schedule-service";

const querySchema = z.object({
  league: z.enum(LEAGUE_KEYS),
  team: z.string().regex(/^[a-z0-9-]{1,100}$/i),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return await publicResponse(request, `schedule/${query.league}/${query.team.toLowerCase()}`, 300, async () => {
      await protectPublic(request, "read");
      const schedule = await loadTeamSchedule(query.league, query.team, { seasonMode: "auto" });
      return NextResponse.json(
        { ...schedule, autoSeason: schedule.season },
        { headers: { "cache-control": CACHE.schedule } },
      );
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function HEAD(request: NextRequest) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
