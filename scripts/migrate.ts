/**
 * Apply Drizzle migrations from ./drizzle. Bundled into dist/migrate.mjs for
 * the Docker image, where it runs on container start before the server.
 */
import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set; skipping migrations.");
    return;
  }
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
  // Retry briefly: serverless Postgres (e.g. Neon) may be waking from scale-to-zero.
  for (let attempt = 1; ; attempt++) {
    const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder });
      console.log("[migrate] Migrations applied.");
      return;
    } catch (error) {
      if (attempt >= 5) throw error;
      console.warn(`[migrate] Attempt ${attempt} failed, retrying:`, (error as Error).message);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}

main().catch((error) => {
  console.error("[migrate] Failed:", error);
  process.exit(1);
});
