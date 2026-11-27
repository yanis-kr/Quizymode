/**
 * Quiz results on a phone (#898). The e2e-ci web build signs in as the DevTest identity, so this test serves a copy of
 * that one module which reports no identity: the sign-up card then shows, as it does for a visitor. The API is stubbed,
 * so the questions are fixed.
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

const questions = [1, 2, 3, 4, 5].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
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
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/keywords/item-tags")) return json({ names: [] });
    if (pathname.endsWith("/api/featured")) return json({ sets: [], collections: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings\/[^/]+$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
    if (pathname.endsWith("/api/comments")) return json({ comments: [], totalCount: 0 });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 3.6.47 at 375 px the quiz results have no horizontal scroll, every action is at least 44 px tall and Tab follows the visual order", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await signOut(page);
  await stubApi(page);
  await page.goto("/quiz/exams?nav=aws,saa-c03&size=5");

  // Miss the first question so that Review mistakes is offered; the rest are correct.
  const answers = page.getByRole("group", { name: "Answer options" });
  await expect(page.getByText("Question 1", { exact: true })).toBeVisible({ timeout: 15_000 });
  for (let n = 1; n <= 5; n += 1) {
    await answers.getByRole("button", { name: n === 1 ? /1/ : /4/ }).click();
    if (n < 5) {
      await page.getByRole("button", { name: /^next$/i }).click();
      await expect(page.getByText(`Question ${n + 1}`, { exact: true })).toBeVisible();
    }
  }
  await page.getByRole("button", { name: /see my score/i }).click();

  const results = page.locator("section").filter({ has: page.getByRole("heading", { name: "Quiz complete" }) });
  // In the order they must appear: primary, outlined, text links, Keep going tiles, then the sign-up card.
  const actions = [
    results.getByRole("button", { name: "Next 5 questions" }),
    results.getByRole("button", { name: "Review mistakes" }),
    results.getByRole("button", { name: "Play again (same questions)" }),
    results.getByRole("button", { name: "Share result" }),
    results.getByRole("link", { name: "Play a game with this set" }),
    results.getByRole("link", { name: "Browse topic" }),
    results.getByRole("link", { name: /AWS Solutions Architect Professional/ }),
    results.getByRole("link", { name: /AWS Developer Associate/ }),
    results.getByRole("link", { name: /AI and machine learning/ }),
    results.getByRole("link", { name: "Create a free account" }),
    results.getByRole("button", { name: "Not now" }),
    results.getByRole("link", { name: "Sign in" }),
  ];
  for (const action of actions) await expect(action).toBeVisible();
  // The list above is every action on the view.
  await expect(results.locator("a, button")).toHaveCount(actions.length);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("quiz-results-375.png"), fullPage: true });

  // Each action is at least 44 px tall and starts below the one before it (one column at this width).
  let previousBottom = 0;
  for (const [index, action] of actions.entries()) {
    const box = (await action.boundingBox())!;
    expect(box.height, `height of action ${index + 1}`).toBeGreaterThanOrEqual(44);
    expect(box.y, `top of action ${index + 1}`).toBeGreaterThanOrEqual(previousBottom - 1);
    previousBottom = box.y + box.height;
  }

  // The heading takes focus on arrival, and each Tab moves to the next action in that visual order.
  await expect(results.getByRole("heading", { name: "Quiz complete" })).toBeFocused();
  for (const action of actions) {
    await page.keyboard.press("Tab");
    await expect(action).toBeFocused();
  }
});
