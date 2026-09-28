import { expect, test } from "@playwright/test";

import { pickTeam } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
});

test("NFL → Steelers → schedule → download", async ({ page }) => {
  await pickTeam(page, "NFL", "steelers", "Pittsburgh Steelers");
  await expect(page.getByTestId("event-preview").first()).toContainText(/Steelers (vs|@)/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-button").first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pittsburgh-steelers-\d{4}\.ics$/);
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  const ics = readFileSync(path!, "utf8");
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toMatch(/UID:espn-\d+-23@sportscal\.site/);
});

test("NBA → Thunder → customize title template", async ({ page }) => {
  await pickTeam(page, "NBA", "okc", "Oklahoma City Thunder");
  await page.getByRole("button", { name: "Formatting options" }).click();
  const title = page.getByTestId("template-title");
  await title.fill("🏀 {teamAbbr} {homeAwaySymbol} {opponentAbbr}");
  await expect(page.getByTestId("event-preview").first()).toContainText(/🏀 OKC (vs|@) [A-Z]{2,4}/);
  await expect(page).toHaveURL(/league=nba&team=oklahoma-city-thunder/);
});

test("NCAAF → team search includes every division", async ({ page }) => {
  await page.getByText("NCAAF", { exact: true }).click();
  const search = page.getByTestId("team-picker");
  await search.fill("zzzz");
  await expect(page.getByText("No teams found.")).toBeVisible();
  await search.fill("sooners");
  await page.getByRole("option", { name: /Oklahoma Sooners/ }).click();
  await expect(search).toHaveValue("Oklahoma Sooners");
  await expect(page.getByTestId("season-summary")).toContainText("season");
  await expect(page.getByTestId("schedule-row").first()).toBeVisible();

  await search.fill("montana grizzlies");
  await expect(page.getByRole("option", { name: /Montana Grizzlies/ })).toBeVisible();
});

test("exclude an individual game", async ({ page }) => {
  await pickTeam(page, "NCAAF", "sooners", "Oklahoma Sooners");
  const count = page.getByTestId("included-count");
  const before = Number((await count.textContent())!.split(" ")[0]);
  await page.getByTestId("schedule-row").first().getByRole("button", { name: /^Edit/ }).click();
  await page.getByRole("dialog").getByLabel("Include this game in the calendar").click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(count).toContainText(`${before - 1} of`);
  await expect(page.getByTestId("schedule-row").first()).toContainText("Excluded from calendar");
  await expect(page.getByTestId("schedule-row").first()).toContainText("Override");
});
