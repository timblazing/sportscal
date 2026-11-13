import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ headers: vi.fn(), withDatabase: vi.fn(), getRow: vi.fn() }));
vi.mock("next/headers", () => ({ headers: stubs.headers }));
vi.mock("@/lib/db/client", () => ({ withDatabase: stubs.withDatabase }));
vi.mock("@/lib/db/calendars", () => ({
  getCalendarRow: stubs.getRow,
  rowToConfig: () => ({ league: "mlb", teamId: "1", teamSlug: "team" }),
}));
vi.mock("@/lib/espn/teams", () => ({ findTeam: async () => undefined }));
vi.mock("@/components/subscription/manage-calendar", () => ({
  ManageCalendar: ({ publicId }: { publicId: string }) => `manage-ui:${publicId}`,
}));

import { resetPublicWindows } from "@/lib/cache/abuse";
import ManagePage from "@/app/manage/[publicId]/page";

const publicId = "abcdefghijkl";
const page = (id = publicId) => ManagePage({ params: Promise.resolve({ publicId: id }) } as never);
const from = (ip: string) => stubs.headers.mockResolvedValue(new Headers({ "x-forwarded-for": ip }));
const html = async (id?: string) => renderToStaticMarkup(await page(id));

beforeEach(() => {
  vi.resetAllMocks();
  resetPublicWindows();
  from("203.0.113.5");
  stubs.withDatabase.mockImplementation((operation: () => Promise<unknown>) => operation());
  stubs.getRow.mockResolvedValue({ publicId });
});

it("renders the manage view for an allowed request", async () => {
  expect(await html()).toContain(`manage-ui:${publicId}`);
  expect(stubs.withDatabase).toHaveBeenCalledTimes(1);
});

it("skips the database for malformed IDs", async () => {
  await expect(page("not a valid id!")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  expect(stubs.withDatabase).not.toHaveBeenCalled();
});

it("does not open a database scope once a client is over the limit", async () => {
  for (let i = 0; i < 30; i++) await page();
  expect(stubs.withDatabase).toHaveBeenCalledTimes(30);

  const denied = await html();
  expect(denied).toContain("Too many requests");
  expect(denied).not.toContain("manage-ui");
  expect(stubs.withDatabase).toHaveBeenCalledTimes(30);
  expect(stubs.getRow).toHaveBeenCalledTimes(30);
});

it("keeps limiting per client address", async () => {
  for (let i = 0; i < 31; i++) await page();
  from("198.51.100.7");
  expect(await html()).toContain(`manage-ui:${publicId}`);
});

it("does not spend the limit on malformed IDs", async () => {
  for (let i = 0; i < 40; i++) await page("bad id").catch(() => undefined);
  expect(await html()).toContain(`manage-ui:${publicId}`);
});
