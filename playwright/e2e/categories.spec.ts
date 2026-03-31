/**
 * Categories E2E tests — AC 3.1 Listing categories / AC 3.4 Sets view
 */
import { test, expect } from "@playwright/test";

async function openFirstCategoryWithItems(page: import("@playwright/test").Page) {
  await page.goto("/categories");
  await page.waitForLoadState("networkidle");

  const categoryCard = page
    .getByRole("button", { name: /\b[1-9]\d* items\b/i })
    .first();

  await expect(categoryCard).toBeVisible();
  await categoryCard.click();
  await page.waitForLoadState("networkidle");
}

test(
  "AC 3.1 @smoke - categories page shows at least one category card",
  async ({ page }) => {
    await page.goto("/categories");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/categories/);

    // Category cards are rendered as role="button" by BucketGridView
    const cards = page.locator('[role="button"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  }
);

test(
  "AC 3.1 @smoke - clicking a category navigates to its scoped page",
  async ({ page }) => {
    await openFirstCategoryWithItems(page);

    // URL must now include a category slug segment after /categories/
    await expect(page).toHaveURL(/\/categories\/.+/);
  }
);

test(
  "AC 3.4 - category Sets view shows secondary navigation with mode tabs",
  async ({ page }) => {
    await openFirstCategoryWithItems(page);

    // Secondary nav exposes the current scope modes.
    await expect(page.getByRole("tab", { name: /^list$/i })).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.getByRole("tab", { name: /^quiz$/i })).toBeVisible({
      timeout: 3_000,
    });
  }
);

test(
  "AC 3.4 - category Sets view shows keyword buckets",
  async ({ page }) => {
    await openFirstCategoryWithItems(page);

    // Keyword bucket cards are buttons labeled with a non-zero item count.
    const buckets = page.getByRole("button", {
      name: /\b[1-9]\d* items\b/i,
    });

    await expect(buckets.first()).toBeVisible({ timeout: 3_000 });
    expect(await buckets.count()).toBeGreaterThan(0);
  }
);
