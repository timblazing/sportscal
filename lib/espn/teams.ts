import { sharedLoad } from "@/lib/cache/shared";

import { LEAGUES, type LeagueConfig, type LeagueKey } from "@/lib/config/leagues";
import type { SportsCalTeam } from "@/lib/types";
import { REVALIDATE, buildEspnUrl, espnFetchJson } from "@/lib/espn/client";
import { normalizeTeam } from "@/lib/espn/normalize";
import {
  espnGroupsResponseSchema,
  espnStandingsNodeSchema,
  espnTeamsResponseSchema,
  espnTeamSchema,
  type EspnGroupNode,
  type EspnStandingsNode,
  type EspnTeam,
} from "@/lib/espn/schemas";

export interface CatalogTeam extends SportsCalTeam {
  /** "primary" teams are shown by default; others only with "Show all teams". */
  tier: "primary" | "secondary" | "other";
  /** College subdivision label ("FBS", "FCS", "Division I"). */
  subdivision?: string;
}

interface Membership {
  team?: EspnTeam;
  conference?: SportsCalTeam["conference"];
  division?: SportsCalTeam["division"];
  subdivision?: string;
  tier: CatalogTeam["tier"];
}

// ---------------------------------------------------------------------------
// Pure builders (unit tested with fixtures)
// ---------------------------------------------------------------------------

export function parseTeamsResponse(data: unknown): EspnTeam[] {
  const parsed = espnTeamsResponseSchema.parse(data);
  return parsed.sports.flatMap((s) => s.leagues.flatMap((l) => l.teams.map((t) => t.team)));
}

/** NFL/NBA/NHL: `/groups` returns conference → division → teams. */
export function membershipFromGroups(data: unknown): Map<string, Membership> {
  const parsed = espnGroupsResponseSchema.parse(data);
  const map = new Map<string, Membership>();
  const visit = (node: EspnGroupNode, conference?: EspnGroupNode) => {
    for (const team of node.teams ?? []) {
      map.set(team.id, {
        tier: "primary",
        conference: conference
          ? { id: conference.id, name: conference.name ?? "", shortName: conference.abbreviation }
          : node.name
            ? { id: node.id, name: node.name, shortName: node.abbreviation }
            : undefined,
        division: conference && node.name ? { id: node.id, name: node.name } : undefined,
      });
    }
    for (const child of node.children ?? []) visit(child, conference ?? node);
  };
  for (const group of parsed.groups) visit(group);
  return map;
}

/** College standings groups list conferences containing team entries. */
export function membershipFromStandings(
  data: unknown,
  tier: Membership["tier"],
  map: Map<string, Membership> = new Map(),
): Map<string, Membership> {
  const root = espnStandingsNodeSchema.parse(data);
  const subdivision = root.shortName ?? root.name;
  const visit = (node: EspnStandingsNode, conference?: EspnStandingsNode) => {
    const conf = conference ?? (node.isConference ? node : undefined);
    for (const entry of node.standings?.entries ?? []) {
      if (map.has(entry.team.id)) continue;
      map.set(entry.team.id, {
        team: entry.team,
        tier,
        subdivision,
        conference: conf
          ? {
              id: conf.id,
              name: conferenceLabel(conf),
              shortName: conf.abbreviation,
            }
          : undefined,
        division: conf && conf !== node && node.name ? { id: node.id, name: node.name } : undefined,
      });
    }
    for (const child of node.children ?? []) visit(child, conf);
  };
  visit(root);
  return map;
}

/** MLS: direct standings children are conferences without isConference flags. */
export function membershipFromConferenceStandings(data: unknown): Map<string, Membership> {
  const root = espnStandingsNodeSchema.parse(data);
  const map = new Map<string, Membership>();
  for (const conference of root.children ?? []) {
    for (const entry of conference.standings?.entries ?? []) {
      map.set(entry.team.id, {
        tier: "primary",
        conference: { id: conference.id, name: conference.name ?? "", shortName: conference.abbreviation },
      });
    }
  }
  return map;
}

function conferenceLabel(node: EspnStandingsNode): string {
  const name = node.shortName ?? node.name ?? "";
  return /independent|indep\./i.test(name) ? "Independents" : name;
}

export function buildCatalog(
  league: LeagueConfig,
  teams: EspnTeam[],
  membership: Map<string, Membership>,
): CatalogTeam[] {
  const seen = new Set<string>();
  const catalog: CatalogTeam[] = [];
  // Standings can include active D-I transitions omitted from the team endpoint.
  // Put catalog entries first so their richer metadata wins when ids overlap.
  const standingsTeams = [...membership.values()].flatMap((m) => m.team ? [m.team] : []);
  for (const raw of [...teams, ...standingsTeams]) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    if (raw.isActive === false) continue;
    const m = membership.get(raw.id);
    const tier: CatalogTeam["tier"] = m?.tier ?? (league.teamGrouping.kind === "groups" || league.teamGrouping.kind === "flat" || league.teamGrouping.kind === "conferenceStandings" ? "primary" : "other");
    const team = normalizeTeam(raw, league, {
      conference: m?.conference,
      division: m?.division,
      ...(league.key === "ncaaf" ? { isFbs: m?.subdivision === "FBS" } : {}),
    });
    const slug = catalog.some((existing) => existing.slug === team.slug) ? `${team.slug}-${team.id}` : team.slug;
    catalog.push({ ...team, slug, tier, subdivision: m?.subdivision });
  }
  return catalog.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------------------------------------------------------------------------
// ESPN data access
// ---------------------------------------------------------------------------

async function loadCatalog(leagueKey: LeagueKey): Promise<CatalogTeam[]> {
  const league = LEAGUES[leagueKey];
  const teamsUrl = buildEspnUrl("site", league, ["teams"], { limit: 1000 });
  const teamsData = await espnFetchJson(teamsUrl, { revalidate: REVALIDATE.teams });

  let membership: Map<string, Membership>;
  if (league.teamGrouping.kind === "flat") {
    membership = new Map();
  } else if (league.teamGrouping.kind === "groups") {
    const data = await espnFetchJson(buildEspnUrl("site", league, ["groups"]), {
      revalidate: REVALIDATE.teams,
    });
    membership = membershipFromGroups(data);
  } else if (league.teamGrouping.kind === "conferenceStandings") {
    const data = await espnFetchJson(buildEspnUrl("standings", league, ["standings"]), {
      revalidate: REVALIDATE.teams,
    });
    membership = membershipFromConferenceStandings(data);
  } else {
    const { defaultGroupIds, extendedGroupIds } = league.teamGrouping;
    const groups = [
      ...defaultGroupIds.map((id) => ({ id, tier: "primary" as const })),
      ...extendedGroupIds.map((id) => ({ id, tier: "secondary" as const })),
    ];
    const results = await Promise.allSettled(
      groups.map((g) =>
        espnFetchJson(buildEspnUrl("standings", league, ["standings"], { group: g.id }), {
          revalidate: REVALIDATE.teams,
        }),
      ),
    );
    membership = new Map();
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        membershipFromStandings(result.value, groups[i].tier, membership);
      } else {
        throw result.reason;
      }
    });
  }

  return buildCatalog(league, parseTeamsResponse(teamsData), membership);
}

/**
 * Normalized team catalog, cached as a whole (the raw NCAAF team list is close
 * to Next's per-fetch cache limit, the normalized catalog is small).
 */
export function getTeamCatalog(leagueKey: LeagueKey): Promise<CatalogTeam[]> {
  return sharedLoad(`catalog:${leagueKey}`, REVALIDATE.teams, () => loadCatalog(leagueKey));
}

export async function getTeams(
  leagueKey: LeagueKey,
  options: { includeAll?: boolean } = {},
): Promise<CatalogTeam[]> {
  const catalog = await getTeamCatalog(leagueKey);
  return options.includeAll ? catalog : catalog.filter((t) => t.tier === "primary");
}

export async function findTeam(
  leagueKey: LeagueKey,
  slugOrId: string,
  allowUncatalogued = false,
): Promise<CatalogTeam | undefined> {
  const key = slugOrId.toLowerCase();
  // Catalogs include the standings' transition teams. Unknown numeric IDs
  // must never become arbitrary ESPN probes or allocate shared cache rows.
  const catalog = await getTeamCatalog(leagueKey);
  const found = catalog.find((t) => t.slug === key) ?? catalog.find((t) => t.id === slugOrId);
  if (found || !allowUncatalogued || !/^\d{1,10}$/.test(slugOrId)) return found;
  // Only a configuration already persisted behind an edit token may use this
  // compatibility escape hatch for a team omitted from today's catalog.
  return sharedLoad(`team:${leagueKey}:${slugOrId}`, REVALIDATE.teams, async () => {
    const data = await espnFetchJson(buildEspnUrl("site", LEAGUES[leagueKey], ["teams", slugOrId]), { revalidate: REVALIDATE.teams });
    const raw = typeof data === "object" && data !== null && "team" in data ? data.team : data;
    const team = normalizeTeam(espnTeamSchema.parse(raw), LEAGUES[leagueKey]);
    if (team.id !== slugOrId) throw new Error("Unexpected ESPN team");
    return { ...team, tier: "primary" as const };
  });
}
