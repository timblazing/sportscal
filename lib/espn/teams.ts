import { unstable_cache } from "next/cache";

import { LEAGUES, type LeagueConfig, type LeagueKey } from "@/lib/config/leagues";
import type { SportsCalTeam } from "@/lib/types";
import { REVALIDATE, buildEspnUrl, espnFetchJson } from "@/lib/espn/client";
import { normalizeTeam } from "@/lib/espn/normalize";
import {
  espnGroupsResponseSchema,
  espnStandingsNodeSchema,
  espnTeamsResponseSchema,
  type EspnGroupNode,
  type EspnStandingsNode,
  type EspnTeam,
} from "@/lib/espn/schemas";

export interface CatalogTeam extends SportsCalTeam {
  /** "primary" teams are shown by default; others only with "Show all teams". */
  tier: "primary" | "secondary" | "other";
  /** Subdivision label for college football ("FBS", "FCS"). */
  subdivision?: string;
}

interface Membership {
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

/** NFL/NBA: `/groups` returns conference → division → teams. */
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

/** NCAAF: standings for a division group (FBS=80, FCS=81) list conferences with entries. */
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
  for (const raw of teams) {
    if (seen.has(raw.id) || raw.isActive === false) continue;
    seen.add(raw.id);
    const m = membership.get(raw.id);
    const tier: CatalogTeam["tier"] = m?.tier ?? (league.teamGrouping.kind === "groups" ? "primary" : "other");
    const team = normalizeTeam(raw, league, {
      conference: m?.conference,
      division: m?.division,
      ...(league.key === "ncaaf" ? { isFbs: m?.subdivision === "FBS" } : {}),
    });
    catalog.push({ ...team, tier, subdivision: m?.subdivision });
  }
  return catalog.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------------------------------------------------------------------------
// ESPN data access
// ---------------------------------------------------------------------------

async function loadCatalog(leagueKey: LeagueKey): Promise<CatalogTeam[]> {
  const league = LEAGUES[leagueKey];
  const teamsUrl = buildEspnUrl("site", league, ["teams"], { limit: 1000 });
  const teamsPromise = espnFetchJson(teamsUrl, { revalidate: REVALIDATE.teams });

  let membership: Map<string, Membership>;
  if (league.teamGrouping.kind === "groups") {
    const data = await espnFetchJson(buildEspnUrl("site", league, ["groups"]), {
      revalidate: REVALIDATE.teams,
    });
    membership = membershipFromGroups(data);
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
      } else if (groups[i].tier === "primary") {
        throw result.reason;
      }
    });
  }

  return buildCatalog(league, parseTeamsResponse(await teamsPromise), membership);
}

/**
 * Normalized team catalog, cached as a whole (the raw NCAAF team list is close
 * to Next's per-fetch cache limit, the normalized catalog is small).
 */
export const getTeamCatalog = unstable_cache(loadCatalog, ["espn-team-catalog-v1"], {
  revalidate: REVALIDATE.teams,
});

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
): Promise<CatalogTeam | undefined> {
  const catalog = await getTeamCatalog(leagueKey);
  const key = slugOrId.toLowerCase();
  return catalog.find((t) => t.slug === key) ?? catalog.find((t) => t.id === slugOrId);
}
