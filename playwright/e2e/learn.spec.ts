/**
 * Learn mode E2E — AC 3.17.12 mode switcher on a 375 px viewport.
 */
import { test, expect } from "../fixtures";

test.use({ viewport: { width: 375, height: 812 } });

test("AC 3.17.12 @smoke - Learn and Games tabs follow Quiz, the strip fits the viewport and Learn opens", async ({ page }) => {
  await page.goto("/categories");
  await page.waitForLoadState("networkidle");

  const categoryCard = page.getByRole("button", { name: /\b[1-9]\d* items\b/i }).first();
  await expect(categoryCard).toBeVisible({ timeout: 3_000 });
  await categoryCard.click();
  await page.waitForLoadState("networkidle");

  const labels = await page.getByRole("tab").allTextContents();
  expect(labels.map((label) => label.trim()).slice(-3)).toEqual(["Quiz", "Learn", "Games"]);

  // The page is never wider than the viewport, even when the tab strip overflows.
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);

  await page.getByRole("tab", { name: /^learn$/i }).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/learn\//);
  await expect(page.getByRole("tab", { name: /^learn$/i })).toHaveAttribute("aria-selected", "true");

  const afterWidths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(afterWidths.scroll).toBeLessThanOrEqual(afterWidths.inner);
  // The active tab is scrolled into view inside the strip.
  await expect(page.getByRole("tab", { name: /^learn$/i })).toBeInViewport();
});
