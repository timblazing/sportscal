import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stubs = vi.hoisted(() => ({
  admission: vi.fn(), limit: vi.fn(), authorize: vi.fn(), update: vi.fn(), remove: vi.fn(), read: vi.fn(), canonicalize: vi.fn(),
}));
vi.mock("@/lib/cache/abuse", async (original) => ({ ...await original<typeof import("@/lib/cache/abuse")>(), protectPublic: stubs.admission }));
vi.mock("@/lib/db/client", async (original) => ({ ...await original<typeof import("@/lib/db/client")>(), withDatabase: (operation: () => Promise<unknown>) => operation() }));
vi.mock("@/lib/db/calendars", () => ({
  authorizeCalendar: stubs.authorize, updateCalendar: stubs.update, deleteCalendar: stubs.remove,
  getCalendarRow: stubs.read, rowToConfig: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: stubs.limit }));
vi.mock("@/lib/calendar-service", () => ({ canonicalizeConfig: stubs.canonicalize }));
import { PublicRateLimitError } from "@/lib/cache/abuse";
import { CacheUnavailableError } from "@/lib/cache/coordinator";
import { POST } from "@/app/api/calendars/route";
import { DELETE, GET, PATCH } from "@/app/api/calendars/[publicId]/route";

const publicId = "abcdefghijkl";
const ctx = () => ({ params: Promise.resolve({ publicId }) });
const request = (method: string, authenticated = true) => new NextRequest(`https://example.test/api/calendars/${publicId}`, {
  method,
  headers: authenticated ? { authorization: `Bearer ${"a".repeat(43)}` } : {},
});
beforeEach(() => {
  vi.resetAllMocks();
  stubs.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
});

it("denies saved-config reads and DELETE before data access when rate-limited", async () => {
  stubs.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
  for (const method of ["GET", "DELETE"]) {
    const response = await (method === "GET" ? GET : DELETE)(request(method), ctx());
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
  }
  expect(stubs.read).not.toHaveBeenCalled();
  expect(stubs.remove).not.toHaveBeenCalled();
});

it("does not mutate without a bearer token or successful authorization", async () => {
  expect((await DELETE(request("DELETE", false), ctx())).status).toBe(403);
  expect(stubs.remove).not.toHaveBeenCalled();
  stubs.authorize.mockResolvedValue({ ok: false, reason: "unauthorized" });
  expect((await PATCH(request("PATCH"), ctx())).status).toBe(403);
  expect(stubs.canonicalize).not.toHaveBeenCalled();
  expect(stubs.update).not.toHaveBeenCalled();
});

it("keeps successful DELETE responses out of caches", async () => {
  stubs.remove.mockResolvedValue({ ok: true, value: null });
  const response = await DELETE(request("DELETE"), ctx());
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("no-store");
});


it("fails closed on global admission denial or coordinator failure before PostgreSQL", async () => {
  for (const [error, status] of [[new PublicRateLimitError(), 429], [new CacheUnavailableError(), 503]] as const) {
    stubs.admission.mockRejectedValue(error);
    for (const method of ["POST", "GET", "PATCH", "DELETE"]) {
      const req = request(method);
      const response = method === "POST" ? await POST(req) : await ({ GET, PATCH, DELETE }[method as "GET" | "PATCH" | "DELETE"])(req, ctx());
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }
  expect(stubs.limit).not.toHaveBeenCalled();
  expect(stubs.read).not.toHaveBeenCalled();
  expect(stubs.remove).not.toHaveBeenCalled();
  expect(stubs.update).not.toHaveBeenCalled();
});
