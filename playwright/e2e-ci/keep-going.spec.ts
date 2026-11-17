/**
 * Keep going and Next 5 on the completion view (#711, AC 3.6.37). The API is stubbed, so the questions are fixed and the
 * test does not depend on the catalog. Runs at 375 px, the phone width the AC names.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const questions = [1, 2, 3, 4, 5].map((n) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  category: "exams",
  isPrivate: false,
  question: `Question ${n}`,
  correctAnswer: "4",
  incorrectAnswers: ["1", "2", "3"],
  explanation: "Four is the answer.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [
    { id: "k-aws", name: "aws", isPrivate: false },
    { id: "k-saa", name: "saa-c03", isPrivate: false },
  ],
  collections: [],
}));

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/items")) {
      return json({ items: questions, totalCount: questions.length, page: 1, pageSize: 5, totalPages: 1 });
    }
    if (pathname.endsWith("/api/categories")) {
      return json({ categories: [{ category: "exams", count: 5, description: "Exams", averageRating: null }] });
    }
    // The DevTest identity signs the page in, so the page-size hook reads settings; an empty map keeps the default.
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/keywords/item-tags")) return json({ names: [] });
    if (pathname.endsWith("/api/featured")) return json({ sets: [], collections: [] });
    if (pathname.endsWith("/api/games/roster")) return json({ items: [], scopes: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings\/[^/]+$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
    if (pathname.endsWith("/api/comments")) return json({ comments: [], totalCount: 0 });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 3.6.37 at 375 px the completion view has no horizontal scroll, Next and Keep going tiles are 44 px tall, and the controls take focus in visual order", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await page.goto("/quiz/exams?nav=aws,saa-c03&size=5");

  // Answer all five questions correctly; the first four advance with Next, the last one ends the run.
  await expect(page.getByText("Question 1", { exact: true })).toBeVisible();
  for (let n = 1; n <= 5; n += 1) {
    await page.getByRole("button", { name: /4/i }).click();
    if (n < 5) {
      await page.getByRole("button", { name: /^next$/i }).click();
      await expect(page.getByText(`Question ${n + 1}`, { exact: true })).toBeVisible();
    }
  }
  await page.getByRole("button", { name: /see my score/i }).click();

  const next = page.getByRole("button", { name: "Next 5 questions" });
  const tile = page.getByRole("link", { name: /AWS Solutions Architect Professional/ });
  await expect(next).toBeVisible();
  await expect(tile).toBeVisible();

  // No horizontal page scroll at 375 px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

  // Primary action and Keep going tile are at least 44 px tall.
  const nextBox = await next.boundingBox();
  const tileBox = await tile.boundingBox();
  expect(nextBox?.height ?? 0, "Next 5 questions height").toBeGreaterThanOrEqual(44);
  expect(tileBox?.height ?? 0, "Keep going tile height").toBeGreaterThanOrEqual(44);

  // Visual order: Next comes above the Keep going tiles.
  expect(nextBox!.y).toBeLessThan(tileBox!.y);

  // Both controls take keyboard focus.
  await next.focus();
  await expect(next).toBeFocused();
  await tile.focus();
  await expect(tile).toBeFocused();
});

test("AC 3.6.31 finishing exams/aws/saa-c03 shows Keep going with two related tiles and one Change of pace tile, and the tiles open five-question quizzes", async ({ page }) => {
  test.setTimeout(60_000);
  await stubApi(page);
  await page.goto("/quiz/exams?nav=aws,saa-c03&size=5");

  await expect(page.getByText("Question 1", { exact: true })).toBeVisible();
  for (let n = 1; n <= 5; n += 1) {
    await page.getByRole("button", { name: /4/i }).click();
    if (n < 5) {
      await page.getByRole("button", { name: /^next$/i }).click();
      await expect(page.getByText(`Question ${n + 1}`, { exact: true })).toBeVisible();
    }
  }
  await page.getByRole("button", { name: /see my score/i }).click();

  const block = page.getByTestId("keep-going");
  await expect(block.getByRole("heading", { name: "Keep going", exact: true })).toBeVisible();
  await expect(block.getByRole("heading", { name: "Change of pace", exact: true })).toBeVisible();
  // Two related sets and one Change of pace tile, no other links.
  await expect(block.getByRole("link")).toHaveCount(3);

  const sapTile = block.getByRole("link", { name: /AWS Solutions Architect Professional/ });
  const dvaTile = block.getByRole("link", { name: /AWS Developer Associate/ });
  const paceTile = block.getByRole("link", { name: /AI and machine learning/ });
  await expect(sapTile).toHaveAttribute("href", /^\/quiz\/exams\?.*size=5/);
  await expect(dvaTile).toHaveAttribute("href", /^\/quiz\/exams\?.*size=5/);
  await expect(paceTile).toHaveAttribute("href", /^\/quiz\/tech\?.*size=5/);

  // Following the Change of pace tile opens its five-question quiz.
  await paceTile.click();
  await expect(page).toHaveURL(/\/quiz\/tech\?.*size=5/);
});
