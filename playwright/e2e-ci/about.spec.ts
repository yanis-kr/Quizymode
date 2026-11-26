/**
 * About page (#883). The API is stubbed, so the page does not depend on the catalog or the starter pool content.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 3.0.37 at 390x844 the About heading and Try 5 questions are above the fold, the button is 44 px tall and links to /start, and Browse topics links to /categories", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubApi(page);
  await page.goto("/about");

  const heading = page.getByRole("heading", { level: 1, name: "A quiz app that got a little out of hand." });
  const tryIt = page.getByRole("link", { name: "Try 5 questions" });
  await expect(heading).toBeInViewport();
  await expect(tryIt).toBeInViewport();
  await expect(tryIt).toHaveAttribute("href", "/start");
  const box = await tryIt.boundingBox();
  expect(box?.height ?? 0, "Try 5 questions height").toBeGreaterThanOrEqual(44);
  expect((box?.y ?? Infinity) + (box?.height ?? 0), "Try 5 questions bottom edge").toBeLessThanOrEqual(844);
  await expect(page.getByRole("link", { name: "Browse topics" })).toHaveAttribute("href", "/categories");
});
