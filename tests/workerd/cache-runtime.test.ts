import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let mf: Miniflare;
let storage: string;
let script: string;
function runtime() {
  return new Miniflare({ ...convertV4MiniflareOptions({
    workers: ["a","b"].map((name) => ({ name, modules: true, script, compatibilityDate: "2026-10-01", d1Databases: { CACHE: "local-test-only-sportscal" } })),
  }), resourcePersistencePath: storage });
}
async function db() { return mf.getD1Database("CACHE","a"); }
async function request(route = "/", worker = "a"): Promise<Response> {
  const stub = await mf.getWorker(worker);
  // Miniflare beta types misidentify Fetcher as Request. Check its actual RPC
  // surface rather than forcing incompatible platform types with a cast.
  if (!("fetch" in stub) || typeof stub.fetch !== "function") throw new Error("Missing Worker fetch stub");
  return stub.fetch(`https://test.invalid${route}`);
}
async function used() { return (await (await db()).prepare("SELECT attempts FROM upstream_budget WHERE id=1").first<{attempts:number}>())!.attempts; }

beforeAll(async () => {
  storage = await mkdtemp(path.join(tmpdir(),"sportscal-d1-"));
  const bundled = await build({ entryPoints: ["tests/workerd/cache-worker.ts"], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022" });
  script = bundled.outputFiles[0].text;
  mf = runtime();
  const sql = await readFile("db/cache/0001_cache.sql","utf8");
  // D1 exec accepts one SQL statement per line; remove comments first.
  await (await db()).exec(sql.replace(/^--.*$/gm,"").replace(/\n/g," ").split(";").filter((part) => part.trim()).join(";\n"));
});
beforeEach(async () => {
  await (await db()).batch([
    (await db()).prepare("DELETE FROM cache_entries"),
    (await db()).prepare("UPDATE upstream_budget SET budget_day=-1,attempts=0,cooldown_until=0"),
    (await db()).prepare("UPDATE upstream_permits SET token=NULL,expires_at=0"),
  ]);
});
afterAll(async () => { await mf?.dispose(); await rm(storage,{recursive:true,force:true}); });

describe("D1 cache and admission in workerd", () => {
  it("reuses normalized data across separate Worker contexts", async () => {
    const first = await request();
    expect(first.status).toBe(200);
    const initial = await first.json();
    expect(await (await request("/","b")).json()).toEqual(initial);
    expect(await used()).toBe(1);
  });
  it("deduplicates concurrent cold refreshes globally, failing cold losers closed", async () => {
    const results = await Promise.all([request("/","a"),request("/","b"),request("/","a")]);
    expect(results.filter((r) => r.status===200)).toHaveLength(1);
    expect(results.filter((r) => r.status===503)).toHaveLength(2);
    expect(await used()).toBe(1);
    expect((await request("/","b")).status).toBe(200);
  });
  it("recovers cache and quota counters after runtime restart", async () => {
    const first = await (await request()).json();
    await mf.dispose();
    mf=runtime();
    expect(await (await request("/","b")).json()).toEqual(first);
    expect(await used()).toBe(1);
  });
  it("retains last-good snapshot after expired refresh failure, then stops at max stale", async () => {
    const initial = await (await request()).json();
    await (await db()).prepare("UPDATE cache_entries SET fresh_until=0").run();
    expect(await (await request("/?fail=1","b")).json()).toEqual({...initial,freshUntil:0});
    const attempts = await used();
    expect((await request("/?fail=1")).status).toBe(200);
    expect(await used()).toBe(attempts);
    await (await db()).prepare("UPDATE cache_entries SET stale_until=0").run();
    expect((await request("/?fail=1")).status).toBe(503);
  });
  it("never calls upstream after quota exhaustion, including concurrent callers", async () => {
    await request();
    await (await db()).prepare("UPDATE upstream_budget SET attempts=1000").run();
    const responses = await Promise.all([request("/upstream"),request("/upstream","b"),request("/?key=catalog:nba")]);
    expect(responses.map((r) => r.status)).toEqual([503,503,503]);
    expect(await used()).toBe(1000);
  });
  it("admits only four concurrent upstream operations globally", async () => {
    const results=await Promise.all(Array.from({length:8},(_,i) => request("/upstream?delay=1",i%2?"a":"b")));
    expect(results.filter((r) => r.status===200)).toHaveLength(4);
    expect(await used()).toBe(4);
  });
  it.each([429,503])("honors shared cooldown for ESPN %s", async (status) => {
    expect((await request(`/upstream?status=${status}&retry=120`)).status).toBe(status);
    expect((await request("/upstream","b")).status).toBe(503);
    expect(await used()).toBe(1);
    const row=await (await db()).prepare("SELECT cooldown_until FROM upstream_budget").first<{cooldown_until:number}>();
    expect(row!.cooldown_until).toBeGreaterThan(Date.now()+115_000);
  });
  it("invalid cache keys allocate nothing and perform no upstream probes", async () => {
    expect((await request("/?key=arbitrary:user-input")).status).toBe(503);
    expect(await used()).toBe(0);
    const count=await (await db()).prepare("SELECT COUNT(*) AS count FROM cache_entries").first<{count:number}>();
    expect(count!.count).toBe(0);
  });
  it("fails closed if the coordinator is unavailable", async () => {
    await (await db()).exec("DROP TABLE upstream_budget");
    expect((await request("/upstream")).status).toBe(503);
    expect((await request()).status).toBe(503);
    await (await db()).exec("CREATE TABLE upstream_budget(id INTEGER PRIMARY KEY,budget_day INTEGER,attempts INTEGER,cooldown_until INTEGER);\nINSERT INTO upstream_budget VALUES(1,-1,0,0)");
  });
});
