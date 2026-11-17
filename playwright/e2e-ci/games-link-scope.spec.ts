/**
 * Games link scope (#768, AC 3.20 follow-up). The completion view's "Play a game with this set" link goes to
 * /games/exams?nav=...&keywords=...; the games page must send that scope to its roster request. API is stubbed.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

async function stubApi(page: Page): Promise<{ rosterUrls: string[] }> {
  const rosterUrls: string[] = [];
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/api/games/roster")) {
      rosterUrls.push(url.search);
      return json({ items: [], scopes: [] });
    }
    if (url.pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (url.pathname.endsWith("/api/categories")) return json({ categories: [] });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
  return { rosterUrls };
}

test.describe("Games link keeps the quiz scope (#768)", () => {
  test("the games page sends nav and keywords from the link to its roster request", async ({ page }) => {
    const { rosterUrls } = await stubApi(page);
    await page.goto("/games/exams?nav=aws,saa-c03&keywords=aws,saa-c03");
    await expect.poll(() => rosterUrls.length, { timeout: 15000 }).toBeGreaterThan(0);
    const params = new URLSearchParams(rosterUrls[rosterUrls.length - 1]);
    // The roster scope is the category plus navigation keywords: exams/aws/saa-c03 (no games from other exams).
    expect(params.getAll("scope")).toEqual(["exams/aws/saa-c03"]);
  });
});
