import { TeamLogo } from "@/components/builder/team-logo";
import type { LeagueKey } from "@/lib/config/leagues";
import { cn } from "@/lib/utils";

const ESPN = "https://a.espncdn.com/i";

const LEAGUE_LOGOS: Record<LeagueKey, string> = {
  nfl: `${ESPN}/teamlogos/leagues/500-dark/nfl.png`,
  nba: `${ESPN}/teamlogos/leagues/500-dark/nba.png`,
  wnba: `${ESPN}/teamlogos/leagues/500-dark/wnba.png`,
  nhl: `${ESPN}/teamlogos/leagues/500-dark/nhl.png`,
  mlb: `${ESPN}/teamlogos/leagues/500-dark/mlb.png`,
  mls: `${ESPN}/leaguelogos/soccer/500/19.png`,
  epl: `${ESPN}/leaguelogos/soccer/500/23.png`,
  ncaaf: `${ESPN}/espn/misc_logos/500/ncaa_football.png`,
  ncaab: `${ESPN}/espn/misc_logos/500/ncaa.png`,
};

/** Logos that ship dark-on-transparent; rendered as white silhouettes on the dark UI. */
const SILHOUETTE = new Set<LeagueKey>(["ncaaf", "epl"]);

export function LeagueLogo({
  league,
  label,
  size = 20,
  className,
}: {
  league: LeagueKey;
  label: string;
  size?: number;
  className?: string;
}) {
  return <TeamLogo src={LEAGUE_LOGOS[league]} abbreviation={label} size={size} className={cn(SILHOUETTE.has(league) && "brightness-0 invert", className)} />;
}
