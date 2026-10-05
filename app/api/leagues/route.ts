import { NextResponse } from "next/server";

import { LEAGUE_LIST } from "@/lib/config/leagues";

export function GET() {
  return NextResponse.json(
    {
      leagues: LEAGUE_LIST.map((l) => ({
        key: l.key,
        label: l.label,
        name: l.name,
        defaultDurationMinutes: l.defaultDurationMinutes,
        gameTypes: l.gameTypes ?? ["regular", "postseason", "preseason"],
        note: l.note,
      })),
    },
    { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
