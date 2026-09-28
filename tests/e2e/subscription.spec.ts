import { expect, test } from "@playwright/test";

import { pickTeam } from "./helpers";

test("default settings offer the canonical feed", async ({ page, request }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?league=nfl&team=pittsburgh-steelers");
  await expect(page.getByTestId("schedule-row").first()).toBeVisible();
  await page.getByTestId("subscribe-button").first().click();
  const url = await page.getByTestId("subscription-url").inputValue();
  expect(url).toMatch(/\/calendar\/nfl\/pittsburgh-steelers\.ics$/);
  const res = await request.get(new URL(url).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(res.headers()["cache-control"]).toContain("s-maxage");
});

test("save custom subscription, fetch it, then edit with the token", async ({ page, request }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await pickTeam(page, "NBA", "thunder", "Oklahoma City Thunder");
  await page.getByRole("button", { name: "Formatting options" }).click();
  await page.getByTestId("template-title").fill("{teamAbbr} {homeAwaySymbol} {opponentAbbr}");
  await page.getByTestId("subscribe-button").first().click();

  const dialog = page.getByTestId("subscription-dialog");
  await expect(dialog).toBeVisible();
  const feedUrl = await page.getByTestId("subscription-url").inputValue();
  const manageUrl = await page.getByTestId("manage-url").inputValue();
  expect(feedUrl).toMatch(/\/calendar\/nba\/oklahoma-city-thunder\/[0-9a-z]{12}\.ics$/);
  expect(manageUrl).toContain("#token=");

  const feedPath = new URL(feedUrl).pathname;
  const publicId = feedPath.split("/").pop()!.replace(".ics", "");
  const ics = await (await request.get(feedPath)).text();
  expect(ics).toMatch(/SUMMARY:OKC (vs|@) /);
  expect(ics).toContain(`-${publicId}@sportscal.site`);

  // Unauthorized edits fail.
  const denied = await request.patch(`/api/calendars/${publicId}`, {
    headers: { authorization: "Bearer not-the-right-token-000000" },
    data: { config: {} },
  });
  expect(denied.status()).toBe(403);

  // Edit through the manage page using the fragment token.
  await page.goto(manageUrl);
  await expect(page).not.toHaveURL(/#token=/);
  await expect(page.getByText("Editing is enabled in this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Formatting options" }).click();
  await page.getByTestId("template-title").fill("Thunder game: {opponent}");
  await page.getByTestId("subscribe-button").first().click();
  await expect(page.getByText("Calendar saved").first()).toBeVisible();

  const updated = await (await request.get(feedPath)).text();
  expect(updated).toContain("SUMMARY:Thunder game: ");
});

test("custom formatting is shared by download and subscription", async ({ page, request }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await pickTeam(page, "NBA", "thunder", "Oklahoma City Thunder");
  await page.getByRole("button", { name: "Formatting options" }).click();
  await page.getByTestId("template-title").fill("Custom {teamAbbr} {opponent}");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-button").first().click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(downloadPath!, "utf8")).toContain("SUMMARY:Custom OKC ");

  await page.getByTestId("subscribe-button").first().click();
  const feedUrl = await page.getByTestId("subscription-url").inputValue();
  const feed = await (await request.get(new URL(feedUrl).pathname)).text();
  expect(feed).toContain("SUMMARY:Custom OKC ");
});
