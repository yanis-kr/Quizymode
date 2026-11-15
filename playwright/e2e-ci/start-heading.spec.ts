/** /start heading (#627, AC 3.0.2a): exactly one h1, so axe `page-has-heading-one` stays green. */
import { test, expect } from "../fixtures";

test("AC 3.0.2a /start has exactly one h1 on the question view", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByText("Question 1 of 5")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Play a 5-question quiz");
});
