/**
 * Category filters (#707, AC 3.5.12, AC 3.5.14, AC 3.5.15, AC 3.5.18) on the items view. The API is stubbed, so the
 * data is fixed and the tests do not depend on the catalog. Screenshots at 375 px and 1280 px are saved as evidence.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";
import path from "node:path";

const SHOT_DIR = process.env.CATEGORY_FILTER_SHOTS ?? path.join("playwright", "test-results", "category-filters");

const ITEM_KEYWORDS = ["german", "idioms", "funny"];

const item = {
  id: "11111111-1111-1111-1111-111111111111",
  category: "Languages",
  isPrivate: false,
  question: "Which German idiom means 'it rains cats and dogs'?",
  correctAnswer: "Es regnet Bindfäden",
  incorrectAnswers: ["Die Katze schläft", "Der Hund bellt"],
  explanation: "Bindfäden are strings; the idiom describes heavy rain.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: ITEM_KEYWORDS.map((name, i) => ({ id: `k${i}`, name, isPrivate: false })),
  collections: [],
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/api/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/categories")) {
      return json({ categories: [{ category: "Languages", count: 10, description: "Languages", averageRating: null }] });
    }
    if (pathname.endsWith("/api/items")) {
      return json({ items: [item], totalCount: 1, page: 1, pageSize: 20, totalPages: 1 });
    }
    if (pathname.endsWith("/api/keywords/item-tags")) return json({ names: [] });
    if (pathname.endsWith("/api/featured")) return json({ sets: [], collections: [] });
    if (pathname.endsWith("/api/games/roster")) return json({ items: [], scopes: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings\/[^/]+$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
    if (pathname.endsWith("/api/comments")) return json({ comments: [], totalCount: 0 });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

async function openItems(page: Page, url: string): Promise<void> {
  await stubApi(page);
  await page.goto(url);
  await expect(page.getByText(item.question)).toBeVisible();
}

const activeFilters = (page: Page) => page.getByRole("group", { name: "Active filters" });

test.describe("Category filters (#707)", () => {
  test("AC 3.5.12 the Filters control shows the refinement count and the active summary is visible without opening the dialog", async ({ page }) => {
    await openItems(page, "/categories/languages/german/idioms?view=items&keywords=funny");
    const trigger = page.getByRole("button", { name: /^Filters/ });
    await expect(trigger).toHaveText("Filters1");
    await expect(activeFilters(page)).toBeVisible();
    await expect(activeFilters(page).getByRole("button", { name: "Remove filter funny" })).toBeVisible();
  });

  test("AC 3.5.14 removing a tag chip keeps the path, resets to page 1 and Back restores the previous URL", async ({ page }) => {
    await openItems(page, "/categories/languages/german/idioms?view=items&keywords=funny");
    await activeFilters(page).getByRole("button", { name: "Remove filter funny" }).click();
    await expect(page).toHaveURL(/\/categories\/languages\/german\/idioms\?view=items&page=1&pagesize=10$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/categories\/languages\/german\/idioms\?view=items&keywords=funny$/);
  });

  test("AC 3.5.15 each chip has a labelled x control of at least 44 px and can be removed from the keyboard", async ({ page }) => {
    await openItems(page, "/categories/languages/german/idioms?view=items&keywords=funny");
    const remove = activeFilters(page).getByRole("button", { name: "Remove filter funny" });
    const box = await remove.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/categories\/languages\/german\/idioms\?view=items&page=1&pagesize=10$/);
  });

  test("AC 3.5.18 a root category without tags shows no chip row and the items still render at 375 px and 1280 px", async ({ page }) => {
    test.setTimeout(60_000);
    for (const [width, height] of [[375, 812], [1280, 900]] as const) {
      await page.setViewportSize({ width, height });
      await openItems(page, "/categories/languages?view=items");
      await expect(activeFilters(page)).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOT_DIR, `after-root-${width}.png`), fullPage: true });
    }
    // Sets view: no chip row and the category heading still renders.
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/categories/languages?view=sets");
    await expect(page.getByRole("heading", { level: 1, name: "Languages" })).toBeVisible();
    await expect(activeFilters(page)).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    await openItems(page, "/categories/languages/german/idioms?view=items&keywords=funny");
    await page.screenshot({ path: path.join(SHOT_DIR, "after-chips-375.png"), fullPage: false });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openItems(page, "/categories/languages/german/idioms?view=items&keywords=funny");
    await page.screenshot({ path: path.join(SHOT_DIR, "after-chips-1280.png"), fullPage: false });
  });
});
