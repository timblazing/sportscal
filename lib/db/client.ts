import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

const globalForDb = globalThis as unknown as { sportscalDb?: Database };

/** Lazily create a single pooled client per server instance. */
export function getDb(): Database {
  if (globalForDb.sportscalDb) return globalForDb.sportscalDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    // Transaction-mode poolers (PgBouncer, Supabase, Neon) don't support prepared statements.
    prepare: false,
  });
  globalForDb.sportscalDb = drizzle(client, { schema });
  return globalForDb.sportscalDb;
}
