import "server-only";

import { findTeam } from "@/lib/espn/teams";
import { TeamNotFoundError } from "@/lib/schedule-service";
import type { CalendarConfig } from "@/lib/validation/calendar-config";

/**
 * Make sure a client-submitted config references a real team in its league
 * and store ESPN's canonical slug for it.
 */
export async function canonicalizeConfig(config: CalendarConfig): Promise<CalendarConfig> {
  const team = await findTeam(config.league, config.teamId);
  if (!team || team.id !== config.teamId) throw new TeamNotFoundError(config.league, config.teamId);
  return { ...config, teamSlug: team.slug };
}
