import { expect, type Page } from "@playwright/test";

export async function pickTeam(page: Page, league: "NFL" | "NBA" | "NCAAF", search: string, name: string) {
  await page.getByText(league, { exact: true }).first().click();
  await page.getByTestId("team-picker").click();
  await page.getByPlaceholder("Team, school, mascot, or abbreviation").fill(search);
  await page.getByRole("option", { name: new RegExp(name) }).first().click();
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await expect(page.getByTestId("schedule-row").first()).toBeVisible();
}
