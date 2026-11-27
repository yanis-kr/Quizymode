/**
 * Discover on a phone (#899). The e2e-ci web build signs in as the DevTest identity, so the test serves a copy of that
 * one module which reports no identity (as ux-first-run.spec.ts does): the app then behaves as it does for a visitor.
 * The API is stubbed, so the page does not depend on which public collections exist.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

async function signOut(page: Page): Promise<void> {
  await page.route(/\/src\/api\/devTestAuth\.ts(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: [
        "export const parseDevTestUser = () => null;",
        "export const devTestIdentity = () => null;",
        "export const devTestAuthorization = () => null;",
      ].join("\n"),
    }),
  );
}

const names = ["World Capitals and Their Landmarks", "Aha Moment Trivia", "Cloud Practitioner Warm-up"];
const collections = names.map((name, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name,
  description: "A short public set to practise with, one question at a time.",
  createdBy: "seeder",
  createdAt: "2026-01-01T00:00:00Z",
  itemCount: 20,
  isBookmarked: false,
}));

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/collections/discover")) return json({ items: collections, totalCount: collections.length });
    if (pathname.endsWith("/rating")) return json({ count: 0, averageStars: null, myStars: null });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 1.3.8 a signed-out visitor sees the first public collection on a 375x812 phone without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signOut(page);
  await stubApi(page);
  await page.goto("/collections");

  await expect(page.getByRole("button", { name: "Mine", exact: true })).toBeDisabled();
  await expect(page.getByText("3 public collections found.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { level: 3, name: names[0] })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("discover-375.png") });
});
