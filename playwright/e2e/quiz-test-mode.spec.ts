/**
 * Quiz Test option E2E - AC 3.18.1, 3.18.2, 3.18.4 on a 375 px viewport.
 */
import { test, expect } from "../fixtures";

test.use({ viewport: { width: 375, height: 812 } });

test("AC 3.18 @smoke - Test setup, palette sheet and Submit dialog fit a 375 px viewport", async ({ page }) => {
  await page.goto("/quiz?mode=test");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("radio", { name: "Test" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Test mode" })).toBeVisible();
  await page.getByRole("button", { name: "Start test" }).click();

  const paletteToggle = page.getByRole("button", { name: /^Questions 1 of/ });
  await expect(paletteToggle).toBeVisible();
  await paletteToggle.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paletteToggle).toBeFocused();

  await page.getByRole("button", { name: "Submit test" }).click();
  await expect(page.getByRole("dialog", { name: "Submit test?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to test" })).toBeFocused();

  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
});
