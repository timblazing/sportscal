import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The deployable OpenNext bundle, produced by `pnpm build:worker`. Running the
// real bundle catches Workers-only failures that Node unit tests cannot.
const BUNDLE = ".open-next/workerd-bundle/worker.js";
const IP = { "cf-connecting-ip": "203.0.113.5" };

let script: string;
let storage: string;
let mf: Miniflare | undefined;
let espn: string[] = [];
let espnStatus = 200;

const fixture = (name: string) => readFile(`tests/fixtures/espn/${name}`, "utf8");

/** Isolated ESPN stub. No request from this runtime can reach the network. */
async function stubEspn(request: Request): Promise<Response> {
  const url = new URL(request.url);
  espn.push(`${url.pathname}${url.search}`);
  if (url.hostname !== "site.api.espn.com") return new Response("blocked", { status: 599 });
  if (espnStatus !== 200) return new Response("busy", { status: espnStatus, headers: { "retry-after": "120" } });
  let name: string | undefined;
  if (url.pathname.endsWith("/scoreboard") && !url.search) name = "scoreboard-wnba.json";
  else if (url.pathname.endsWith("/wnba/teams")) name = "teams-wnba.json";
  else if (url.pathname.endsWith("/standings")) name = "standings-wnba.json";
  else if (url.pathname.endsWith("/teams/20/schedule")) {
    const type = ({ "1": "pre", "2": "reg", "3": "post" } as Record<string, string>)[url.searchParams.get("seasontype") ?? ""];
    if (type) name = `schedule-wnba-dream-2026-${type}.json`;
  }
  if (!name) return new Response("not found", { status: 404 });
  return new Response(await fixture(name), { headers: { "content-type": "application/json" } });
}

async function start(options: { cache?: boolean; bindings?: Record<string, string> } = {}) {
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      workers: [{
        name: "sportscal",
        modules: [{ type: "ESModule", path: BUNDLE, contents: script }],
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
        // Static assets are irrelevant to API/feed routes; keep them out of routing.
        serviceBindings: { WORKER_SELF_REFERENCE: "sportscal", ASSETS: async () => new Response("missing", { status: 404 }) },
        bindings: { APP_URL: "https://sportscal.site", ...options.bindings },
        d1Databases: options.cache === false ? {} : { SPORTSCAL_CACHE: "local-test-only-sportscal" },
        outboundService: stubEspn,
      }],
    }),
    resourcePersistencePath: storage,
  });
  return mf;
}

async function d1() {
  return mf!.getD1Database("SPORTSCAL_CACHE");
}

async function get(route: string, headers: Record<string, string> = {}) {
  return mf!.dispatchFetch(`https://sportscal.site${route}`, { headers: { ...IP, ...headers } });
}

beforeAll(async () => {
  await access(BUNDLE).catch(() => {
    throw new Error(`Missing ${BUNDLE}. Run \`pnpm build:worker\` before \`pnpm test:workerd\`.`);
  });
  script = await readFile(BUNDLE, "utf8");
}, 60_000);

afterEach(async () => {
  await mf?.dispose();
  mf = undefined;
  if (storage) await rm(storage, { recursive: true, force: true });
  espn = [];
  espnStatus = 200;
});

afterAll(async () => {
  await mf?.dispose();
});

async function migrated() {
  storage = await mkdtemp(path.join(tmpdir(), "sportscal-app-"));
  await start();
  const sql = await readFile("db/cache/0001_cache.sql", "utf8");
  await (await d1()).exec(sql.replace(/^--.*$/gm, "").replace(/\n/g, " ").split(";").filter((part) => part.trim()).join(";\n"));
}

describe("OpenNext production bundle in workerd", () => {
  it("serves public data from shared snapshots, reusing them across requests and restarts", async () => {
    await migrated();
    const teams = await get("/api/teams?league=wnba");
    expect(teams.status).toBe(200);
    expect(((await teams.json()) as { teams: { slug: string }[] }).teams[0].slug).toBe("atlanta-dream");
    const schedule = await get("/api/schedule?league=wnba&team=atlanta-dream");
    expect(schedule.status).toBe(200);
    const body = (await schedule.json()) as { autoSeason: unknown; season: unknown };
    expect(body.autoSeason).toEqual(body.season);
    const feed = await get("/calendar/wnba/atlanta-dream.ics");
    expect(feed.status).toBe(200);
    const ics = await feed.text();
    expect(ics).toContain("UID:espn-401918301-20@sportscal.site");
    // Catalog (teams + standings), season (scoreboard), three schedule types.
    expect(espn).toHaveLength(6);

    for (let i = 0; i < 3; i++) expect((await get("/calendar/wnba/atlanta-dream.ics")).status).toBe(200);
    expect(espn).toHaveLength(6);

    // A new runtime has an empty regional cache but the same D1 snapshot:
    // byte-identical feed, same validator, and still no upstream request.
    await mf!.dispose();
    await start();
    const restarted = await get("/calendar/wnba/atlanta-dream.ics");
    expect(await restarted.text()).toBe(ics);
    expect(restarted.headers.get("etag")).toBe(feed.headers.get("etag"));
    expect(espn).toHaveLength(6);
  });

  it("answers conditional feed requests with 304 and HEAD without a body", async () => {
    await migrated();
    const first = await get("/calendar/wnba/atlanta-dream.ics");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const unchanged = await get("/calendar/wnba/atlanta-dream.ics", { "if-none-match": etag });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
    const head = await mf!.dispatchFetch("https://sportscal.site/calendar/wnba/atlanta-dream.ics", { method: "HEAD", headers: IP });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("admits cache hits without D1 writes", async () => {
    await migrated();
    await get("/api/teams?league=wnba");
    const count = async () => (await (await d1()).prepare("SELECT SUM(attempts) AS n FROM public_admissions").first<{ n: number }>())!.n;
    const before = await count();
    for (let i = 0; i < 5; i++) expect((await get("/api/teams?league=wnba")).status).toBe(200);
    expect(await count()).toBe(before);
  });

  it("rejects unknown queries and uncatalogued teams without upstream probes", async () => {
    await migrated();
    expect((await get("/api/teams?league=wnba&cachebuster=1")).status).toBe(400);
    expect((await get("/calendar/wnba/atlanta-dream.ics?x=1")).status).toBe(400);
    expect(espn).toHaveLength(0);
    await get("/api/teams?league=wnba");
    const calls = espn.length;
    expect((await get("/api/schedule?league=wnba&team=9999999")).status).toBe(404);
    expect((await get("/calendar/wnba/not-a-team.ics")).status).toBe(404);
    expect(espn).toHaveLength(calls);
  });

  it("fails closed with zero ESPN requests when D1 is missing or the kill switch is set", async () => {
    storage = await mkdtemp(path.join(tmpdir(), "sportscal-app-"));
    await start({ cache: false });
    const missing = await get("/api/teams?league=wnba");
    expect(missing.status).toBe(503);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect((await get("/calendar/wnba/atlanta-dream.ics")).status).toBe(503);
    await mf!.dispose();
    await start({ bindings: { SPORTS_DATA_DISABLED: "1" } });
    expect((await get("/api/teams?league=wnba")).status).toBe(503);
    expect(espn).toHaveLength(0);
  });

  it("enters a shared cooldown after ESPN 503 instead of retrying per request", async () => {
    await migrated();
    espnStatus = 503;
    expect((await get("/api/teams?league=wnba")).status).toBe(503);
    const calls = espn.length;
    expect(calls).toBeGreaterThan(0);
    espnStatus = 200;
    // A different, uncached resource is blocked by the same global cooldown.
    expect((await get("/api/teams?league=wnba&all=1")).status).toBe(503);
    expect(espn).toHaveLength(calls);
    const row = await (await d1()).prepare("SELECT cooldown_until FROM upstream_budget").first<{ cooldown_until: number }>();
    expect(row!.cooldown_until).toBeGreaterThan(Date.now() + 100_000);
  });

  it("rejects bodies over the limit by UTF-8 bytes, not characters", async () => {
    await migrated();
    // 40,000 two-byte characters: under 64 Ki characters, over 64 KiB.
    const body = JSON.stringify({ config: { padding: "é".repeat(40_000) } });
    const response = await mf!.dispatchFetch("https://sportscal.site/api/download", {
      method: "POST", headers: { ...IP, "content-type": "application/json" }, body,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe("Request body is too large");
    expect(espn).toHaveLength(0);
  });
});
