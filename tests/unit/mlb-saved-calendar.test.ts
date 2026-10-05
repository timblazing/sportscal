import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CalendarConfigRow } from "@/lib/db/schema";
import { defaultConfig } from "@/lib/validation/calendar-config";

const store = vi.hoisted(() => ({ row: undefined as CalendarConfigRow | undefined }));
vi.mock("@/lib/db/client", async original => ({
  ...await original<typeof import("@/lib/db/client")>(),
  getDb: () => ({
    insert: () => ({ values: (columns: Partial<CalendarConfigRow>) => ({ onConflictDoNothing: () => ({ returning: async () => {
      store.row = { ...columns, id: "test", createdAt: new Date(), updatedAt: new Date(), lastAccessedAt: null } as CalendarConfigRow;
      return [{ publicId: columns.publicId }];
    } }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => store.row ? [store.row] : [] }) }) }),
  }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/espn/teams", () => ({ findTeam: async () => ({ id: "19", slug: "los-angeles-dodgers" }) }));
import { POST } from "@/app/api/calendars/route";
import { GET } from "@/app/api/calendars/[publicId]/route";

it("round-trips MLB config through calendar API and database column mapping without a migration", async () => {
  const config = { ...defaultConfig("mlb", { id: "19", slug: "old-slug" }), overrides: { "401897386": { title: "Makeup game" } } };
  const created = await POST(new Request("http://localhost/api/calendars", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }),
  }));
  expect(created.status).toBe(201);
  const body = await created.json();
  expect(body.feedPath).toBe(`/calendar/mlb/los-angeles-dodgers/${body.publicId}.ics`);
  expect(body.config).toEqual({ ...config, teamSlug: "los-angeles-dodgers" });
  expect(store.row?.titleTemplate).toContain("{doubleheader}");
  const loaded = await GET(new NextRequest(`http://localhost/api/calendars/${body.publicId}`), { params: Promise.resolve({ publicId: body.publicId }) });
  expect(loaded.status).toBe(200);
  const saved = await loaded.json();
  expect(saved.config).toEqual(body.config);
  expect(saved).not.toHaveProperty("editTokenHash");
  expect(saved).not.toHaveProperty("editToken");
});
