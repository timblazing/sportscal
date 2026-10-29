import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { getCloudflareContext } from "@opennextjs/cloudflare";
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
  const url = hyperdriveUrl() || process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  scope.client = postgres(url, {
    max: 1,
    // Hyperdrive pools connections and owns TLS to the origin; postgres.js's
    // node:tls path fails under workerd, so Workers must use the binding.
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
  });
  scope.db = drizzle(scope.client, { schema });
  return scope.db;
}

/** Hyperdrive in Workers (query caching disabled: auth and edits must be fresh). */
function hyperdriveUrl(): string | undefined {
  try {
    const env = getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } };
    return env.HYPERDRIVE?.connectionString;
  } catch {
    return undefined; // Node tests and local development.
  }
}
