/** Spoiler-free daily share (#674, AC 3.34.2): copy on desktop, the native share sheet where the browser has one. */
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";

const DATE = "2026-11-02";

function item(id: string) {
  return {
    id,
    category: "trivia",
    isPrivate: false,
    question: `Share question ${id}`,
    correctAnswer: `Share right ${id}`,
    incorrectAnswers: [`Share wrong ${id}`],
    explanation: "",
    createdAt: "2026-10-01T00:00:00Z",
    keywords: [],
    collections: [],
  };
}

/** A fixed two-question day, so the test does not depend on the seeded roster; completion is answered by a stub too. */
async function stubDailyQuiz(page: Page): Promise<void> {
  await page.route("**/api/daily-quiz", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ date: DATE, items: [item("a"), item("b")], completion: null, streak: null }),
    });
  });
  await page.route("**/api/daily-quiz/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        created: true,
        streak: 3,
        completion: { correct: 1, total: 2, completedAt: "2026-11-02T10:00:00Z" },
      }),
    });
  });
}

/** Answers the first question right and the second wrong, then opens the share dialog. */
async function finishAndOpenShare(page: Page): Promise<void> {
  await page.goto("/daily");
  await page.getByRole("button", { name: /Share right a/ }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Share wrong b/ }).click();
  await page.getByRole("button", { name: "See my score" }).click();
  await page.getByRole("button", { name: "Share result" }).click();
}

function expectSpoilerFree(text: string): void {
  expect(text).toContain(`Quizymode Daily ${DATE} 1/2`);
  expect(text).toContain("\u{1F7E9}\u2B1C");
  expect(text).toMatch(/\d+-day streak/);
  expect(text).toContain("/daily");
  expect(text).not.toMatch(/Share question|Share right|Share wrong/);
}

test("AC 3.34.2 desktop: Copy writes the spoiler-free text to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await stubDailyQuiz(page);
  await finishAndOpenShare(page);

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByText("Copied.")).toBeVisible();
  expectSpoilerFree(await page.evaluate(() => navigator.clipboard.readText()));
});

test("AC 3.34.2 mobile: Share via... hands the spoiler-free text to the native share sheet", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: ShareData[] }).__shared = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: ShareData) => {
        (window as unknown as { __shared: ShareData[] }).__shared.push(data);
        return Promise.resolve();
      },
    });
  });
  await stubDailyQuiz(page);
  await finishAndOpenShare(page);

  await page.getByRole("button", { name: "Share via…" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared.length))
    .toBe(1);
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared[0]!);
  expectSpoilerFree(`${shared.text ?? ""}\n${shared.url ?? ""}`);
});
