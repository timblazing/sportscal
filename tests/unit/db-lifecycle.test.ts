import { afterEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => [] as { end: ReturnType<typeof vi.fn>; options: unknown }[]);
vi.mock("postgres", () => ({ default: vi.fn((_url, options) => {
  const client = { end: vi.fn().mockResolvedValue(undefined), options };
  clients.push(client);
  return client;
}) }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: (client: unknown) => ({ client }) }));

import { getDb, withDatabase } from "@/lib/db/client";

afterEach(() => { vi.unstubAllEnvs(); clients.length = 0; });

describe("handler database lifecycle", () => {
  it("creates no connection for handlers that do not access storage", async () => {
    await withDatabase(async () => "ok");
    expect(clients).toHaveLength(0);
  });

  it("shares one client within a handler, including nested scopes, then closes it", async () => {
    vi.stubEnv("DATABASE_URL_POOLED", "postgres://test.invalid/db");
    await withDatabase(async () => {
      const first = getDb();
      expect(getDb()).toBe(first);
      await withDatabase(async () => expect(getDb()).toBe(first));
      expect(clients[0].end).not.toHaveBeenCalled();
    });
    expect(clients).toHaveLength(1);
    expect(clients[0].end).toHaveBeenCalledOnce();
    expect(clients[0].options).toMatchObject({ max: 1, prepare: false });
  });

  it("isolates concurrent requests and closes both when one fails", async () => {
    vi.stubEnv("DATABASE_URL_POOLED", "postgres://test.invalid/db");
    let first: unknown;
    let second: unknown;
    const results = await Promise.allSettled([
      withDatabase(async () => { first = getDb(); await Promise.resolve(); expect(getDb()).toBe(first); throw new Error("failed"); }),
      withDatabase(async () => { second = getDb(); await Promise.resolve(); expect(getDb()).toBe(second); }),
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
    expect(first).not.toBe(second);
    expect(clients).toHaveLength(2);
    for (const client of clients) expect(client.end).toHaveBeenCalledOnce();
    expect(() => getDb()).toThrow("requires withDatabase");
  });
});
