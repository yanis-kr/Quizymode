/**
 * Items E2E tests — AC 2.3 Direct item access / AC 3.5 List Items view
 */
import { test, expect } from "@playwright/test";

function itemDetailLinks(page: import("@playwright/test").Page) {
  return page.locator('a[href^="/items/"][href*="?return="]');
}

/**
 * Drill from /categories into the List view for the first category that has items.
 */
async function navigateToListItems(page: import("@playwright/test").Page) {
  await page.goto("/categories");
  await page.waitForLoadState("networkidle");

  const categoryCard = page
    .getByRole("button", { name: /\b[1-9]\d* items\b/i })
    .first();
  await expect(categoryCard).toBeVisible({ timeout: 3_000 });
  await categoryCard.click();
  await page.waitForLoadState("networkidle");

  // The secondary nav "List" tab switches to the item list.
  await page.getByRole("tab", { name: /^list$/i }).click();
  await page.waitForLoadState("networkidle");
}

test(
  "AC 3.5 @smoke - list items view shows items after navigating into a category",
  async ({ page }) => {
    await navigateToListItems(page);

    // At least one item link must be present
    const itemLinks = itemDetailLinks(page);
    await expect(itemLinks.first()).toBeVisible({ timeout: 3_000 });
    expect(await itemLinks.count()).toBeGreaterThan(0);
  }
);

test(
  "AC 2.3 - item detail page shows question and answer sections",
  async ({ page }) => {
    await navigateToListItems(page);

    // Click through to the first item
    const firstItem = itemDetailLinks(page).first();
    await firstItem.click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/items\//);

    // Both "Question" and "Answer" headings must be visible
    await expect(page.getByText("Question")).toBeVisible();
    await expect(page.getByText("Answer")).toBeVisible();
  }
);

test(
  "AC 3.5.6 - back control on item detail returns to the previous list URL",
  async ({ page }) => {
    await navigateToListItems(page);

    const listUrl = page.url();

    const firstItem = itemDetailLinks(page).first();
    await firstItem.click();
    await page.waitForLoadState("networkidle");

    const backBtn = page.getByRole("button", { name: /^back$/i });

    await expect(backBtn).toBeVisible({ timeout: 3_000 });
    await backBtn.click();

    // Should return to the same list URL (including query params) via SPA navigation.
    await expect(page).toHaveURL(listUrl);
  }
);
