/** /start heading (#627, AC 3.0.35): exactly one h1, so axe `page-has-heading-one` stays green. */
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";

test("AC 3.0.35 /start has exactly one h1 on the question view and axe page-has-heading-one is clean", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByText("Question 1 of 5")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Play a 5-question quiz");
  const axe = await new AxeBuilder({ page }).withRules(["page-has-heading-one"]).analyze();
  expect(axe.violations, "axe page-has-heading-one").toEqual([]);
});
