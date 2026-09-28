import { expect, test } from "@playwright/test";

import { pickTeam } from "./helpers";

test("mobile builder flow", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await pickTeam(page, "NCAAF", "sooners", "Oklahoma Sooners");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("template-title").fill("{teamAbbr} {homeAwaySymbol} {opponentAbbr}");
  await expect(page.getByTestId("event-preview").first()).toContainText(/OU (vs|@) /);
  const download = page.waitForEvent("download");
  await page.getByTestId("download-button").last().click();
  expect((await download).suggestedFilename()).toMatch(/^oklahoma-sooners-/);
});
