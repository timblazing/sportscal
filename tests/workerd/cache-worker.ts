import { guardedFetch, loadSnapshot, type CacheDatabase } from "../../lib/cache/coordinator";

interface Env { CACHE: CacheDatabase }
const worker = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "catalog:nfl";
    try {
      if (url.pathname === "/upstream") {
        const response = await guardedFetch(env.CACHE, "https://site.api.espn.com/stub", {}, async () => {
          if (url.searchParams.has("delay")) await new Promise((resolve) => setTimeout(resolve, 100));
          if (url.searchParams.has("fail")) throw new Error("stub timeout");
          return new Response("{\"ok\":true}", { status: Number(url.searchParams.get("status") ?? 200), headers: { "retry-after": url.searchParams.get("retry") ?? "60" } });
        });
        return new Response(await response.text(), { status: response.status });
      }
      const result = await loadSnapshot(env.CACHE, key, 900, async () => {
        // An isolated workerd fetch stub. Never routes to a real ESPN endpoint.
        const response = await guardedFetch(env.CACHE,"https://site.api.espn.com/stub",{},async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (url.searchParams.has("fail")) throw new Error("stub timeout");
          return Response.json({ teams: ["steelers"] });
        });
        return response.json();
      });
      return Response.json(result);
    } catch {
      return new Response("unavailable", { status: 503 });
    }
  },
};

export default worker;
