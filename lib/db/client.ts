import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cache } from "react";

import * as schema from "@/lib/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * One client per request. Cloudflare Workers can't reuse a socket opened by an
 * earlier request, so the client must not live in module or global scope.
 */
export const getDb = cache((): Database => {
  // Prefer a pooled connection (e.g. Neon's -pooler host) for app traffic.
  const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  const client = postgres(url, {
    max: 1,
    // Transaction-mode poolers (PgBouncer, Supabase, Neon) don't support prepared statements.
    prepare: false,
  });
  return drizzle(client, { schema });
});
