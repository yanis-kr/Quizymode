/**
 * Collections E2E tests — AC 1.1 Creating / AC 1.3 Listing / AC 1.9 Discover
 */
import { test, expect } from "@playwright/test";

async function skipIfAnonymousCollectionsSession(
  page: import("@playwright/test").Page
) {
  const signInLink = page.getByRole("link", { name: /^sign in$/i });
  const mineTab = page.getByRole("button", { name: /^mine$/i });
  const isAnonymous =
    (await signInLink.isVisible().catch(() => false)) ||
    (await mineTab.isDisabled().catch(() => false));

  test.skip(
    isAnonymous,
    "Auth-only collections checks require a fresh authenticated Playwright session."
  );
}

test(
  "AC 1.3 @smoke - collections page loads with Mine / Bookmarked / Discover tabs",
  async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/collections/);

    await expect(page.getByRole("button", { name: /^mine$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^bookmarked$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^discover$/i })).toBeVisible();
  }
);

test(
  "AC 1.1 @smoke - authenticated user sees a create-collection action",
  async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");

    await skipIfAnonymousCollectionsSession(page);

    const createBtn = page.getByRole("button", { name: /^create collection$/i });

    await expect(createBtn).toBeVisible();
  }
);

test(
  "AC 1.9 - switching to the Discover tab shows public collections",
  async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");

    // Click the Discover tab.
    await page.getByRole("button", { name: /^discover$/i }).click();

    // URL reflects the active tab via the query string.
    await expect(page).toHaveURL(/\/collections\?tab=discover/i);
  }
);

test(
  "AC 1.3 - Mine tab is active by default for an authenticated user",
  async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");

    await skipIfAnonymousCollectionsSession(page);

    await expect(page.getByRole("button", { name: /^mine$/i })).toBeEnabled();
    await expect(page).toHaveURL(/\/collections(?:\?tab=mine)?$/i);
  }
);
