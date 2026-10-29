import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseScope = { db?: Database; client?: ReturnType<typeof postgres> };
const scopes = new AsyncLocalStorage<DatabaseScope>();

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Every handler owns its client, including authorization and bookkeeping. */
export async function withDatabase<T>(operation: () => Promise<T>): Promise<T> {
  if (scopes.getStore()) return operation();
  const scope: DatabaseScope = {};
  return scopes.run(scope, async () => {
    try {
      return await operation();
    } finally {
      // end() also closes the socket when the handler throws. No client is
      // created for handlers that never need the database.
      if (scope.client) await scope.client.end({ timeout: 1 });
    }
  });
}

export function getDb(): Database {
  const scope = scopes.getStore();
  if (!scope) throw new Error("Database access requires withDatabase()");
  if (scope.db) return scope.db;
  const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  scope.client = postgres(url, {
    max: 1,
    // Validate the peer certificate; prefer the existing pooled endpoint.
    ssl: "verify-full",
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
  });
  scope.db = drizzle(scope.client, { schema });
  return scope.db;
}
