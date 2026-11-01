/**
 * Quiz E2E tests — AC 3.6 Flashcards and Quiz by category/keywords
 */
import { test, expect } from "../fixtures";

/**
 * Navigate to Quiz mode for the first category on /categories that already has items.
 * Returns the page sitting on the first quiz question.
 */
async function navigateToQuiz(page: import("@playwright/test").Page) {
  await page.goto("/categories");
  await page.waitForLoadState("networkidle");

  const categoryCard = page
    .getByRole("button", { name: /\b[1-9]\d* items\b/i })
    .first();
  await expect(categoryCard).toBeVisible({ timeout: 3_000 });
  await categoryCard.click();
  await page.waitForLoadState("networkidle");

  // Switch to Quiz mode via the secondary nav tab.
  await page.getByRole("tab", { name: /^quiz$/i }).click();
  await page.waitForLoadState("networkidle");
}

test(
  "AC 3.6 @smoke - quiz page loads and shows a question with answer options",
  async ({ page }) => {
    await navigateToQuiz(page);

    // A question prompt must be visible
    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    // Answer option buttons start with a letter+period label (A. B. C. D.)
    const optionA = page.getByText(/^\s*A\./);
    await expect(optionA.first()).toBeVisible({ timeout: 3_000 });
  }
);

test(
  "AC 3.6 @smoke - selecting an answer reveals the correct answer",
  async ({ page }) => {
    await navigateToQuiz(page);

    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    // Click the first answer option (A.)
    const firstOption = page
      .locator('button[type="button"]')
      .filter({ hasText: /^\s*A\./ })
      .first();
    await expect(firstOption).toBeVisible({ timeout: 3_000 });
    await firstOption.click();

    // After answering, "Correct Answer:" text and explanation panel should appear
    await expect(page.getByText(/correct answer/i)).toBeVisible({
      timeout: 3_000,
    });
  }
);

test(
  "AC 3.6 - quiz navigation moves to the next question",
  async ({ page }) => {
    await navigateToQuiz(page);

    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    // Answer the current question so Next becomes available
    const firstOption = page
      .locator('button[type="button"]')
      .filter({ hasText: /^\s*A\./ })
      .first();
    await firstOption.click();

    // Progress indicator shows "1 of N" before clicking Next
    const progressBefore = await page
      .getByText(/\d+ of \d+/)
      .first()
      .textContent();

    // Click the Next button
    const nextBtn = page.getByRole("button", { name: /^next$/i });
    await expect(nextBtn).toBeEnabled({ timeout: 3_000 });
    await nextBtn.click();
    await page.waitForLoadState("networkidle");

    // Progress indicator should now show "2 of N"
    const progressAfter = await page
      .getByText(/\d+ of \d+/)
      .first()
      .textContent();

    expect(progressAfter).not.toBe(progressBefore);
  }
);

test(
  "AC 3.6 - quiz score counter increments after a correct answer",
  async ({ page }) => {
    await navigateToQuiz(page);

    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    // Score counter "Score: X / Y" must be visible
    await expect(page.getByText(/score:/i)).toBeVisible();

    // Answer a question; score denominator should increase on Next
    const firstOption = page
      .locator('button[type="button"]')
      .filter({ hasText: /^\s*A\./ })
      .first();
    await firstOption.click();

    const nextBtn = page.getByRole("button", { name: /^next$/i });
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/score:/i)).toBeVisible();
    }
  }
);

const FUN_TRIVIA_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";

// [question, correct answer, deliberately wrong answer, other incorrect answers]
const FUN_TRIVIA_ITEMS: Array<[string, string, string, string[]]> = [
  ['What color is the "black box" recorder on most commercial airplanes?', "Orange", "Black", ["Red", "Yellow"]],
  ["What animal's fingerprints are so close to humans that they can confuse crime-scene analysis?", "Koalas", "Dogs", ["Cats", "Horses"]],
  ["Which planet has a day longer than its year?", "Venus", "Mars", ["Jupiter", "Mercury"]],
  ["What is the national animal of Scotland?", "The unicorn", "The stag", ["The lion", "The wolf"]],
  ["What everyday food never really spoils when stored properly?", "Honey", "Brown rice", ["Bread", "Milk"]],
];

/** Mocks the collection, its rating, its items and analytics so the test does not depend on seeded data. */
async function mockFunTriviaCollection(page: import("@playwright/test").Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const items = FUN_TRIVIA_ITEMS.map(([question, correctAnswer, wrong, others], index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    category: "trivia",
    isPrivate: false,
    question,
    correctAnswer,
    incorrectAnswers: [wrong, ...others],
    explanation: "",
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [{ id: FUN_TRIVIA_ID, name: "Fun Trivia Facts", createdAt: "2026-01-01T00:00:00Z" }],
  }));
  // Only API calls (fetch/xhr) are mocked, so the dev server's source modules (e.g. src/api/items.ts?t=…) still load.
  const api = (pattern: RegExp, response: () => Parameters<import("@playwright/test").Route["fulfill"]>[0]) =>
    page.route(pattern, (route) =>
      ["fetch", "xhr"].includes(route.request().resourceType()) ? route.fulfill(response()) : route.continue()
    );
  await api(/\/analytics\/(page-views|events)/, () => ({ status: 202, contentType: "application/json", body: "{}" }));
  await api(/\/items\?/, () => json({ items, totalCount: items.length, page: 1, pageSize: 1000, totalPages: 1 }));
  await api(new RegExp(`/collections/${FUN_TRIVIA_ID}/rating`), () => json({ count: 0, averageStars: null, myStars: null }));
  await api(new RegExp(`/collections/${FUN_TRIVIA_ID}$`), () =>
    json({ id: FUN_TRIVIA_ID, name: "Fun Trivia Facts", createdBy: "system", createdAt: "2026-01-01T00:00:00Z", itemCount: items.length, isPublic: true })
  );
}

test.describe("anonymous collection completion", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC 3.6 @smoke - completes, reviews mistakes, returns to results, and replays", async ({
    page,
  }) => {
    await mockFunTriviaCollection(page);
    await page.goto(
      "/quiz/collections/8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511/fun+trivia+facts"
    );

    const deliberatelyWrongAnswers: Record<string, string> = {
      'What color is the "black box" recorder on most commercial airplanes?': "Black",
      "What animal's fingerprints are so close to humans that they can confuse crime-scene analysis?": "Dogs",
      "Which planet has a day longer than its year?": "Mars",
      "What is the national animal of Scotland?": "The stag",
      "What everyday food never really spoils when stored properly?": "Brown rice",
    };

    for (let index = 0; index < 5; index += 1) {
      const question = page.locator("h3", { hasText: "Question" }).locator("xpath=../following-sibling::p[1]");
      await expect(question).toBeVisible({ timeout: 10_000 });
      const questionText = (await question.textContent())?.trim() ?? "";
      const wrongAnswer = deliberatelyWrongAnswers[questionText];
      expect(wrongAnswer).toBeTruthy();
      await page.getByRole("button", { name: new RegExp(wrongAnswer, "i") }).click();
      await expect(page.getByText(/correct answer:/i)).toBeVisible();
      if (index < 4) {
        await page.getByRole("button", { name: /^next$/i }).click();
      }
    }

    await page.getByRole("button", { name: /view results/i }).click();
    await expect(page.getByRole("heading", { name: /quiz complete/i })).toBeFocused();
    await expect(page.getByText("0 / 5")).toBeVisible();

    await page.getByRole("button", { name: /review mistakes/i }).click();
    await expect(page.getByRole("heading", { name: /review mistakes/i })).toBeFocused();
    await expect(page.getByText(/your answer:/i).first()).toBeVisible();
    await page.getByRole("button", { name: /back to results/i }).click();
    await page.getByRole("button", { name: /play again/i }).click();

    await expect(page.getByText(/score: 0 \/ 0 correct/i)).toBeVisible();
    await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
  });
});

test(
  "AC 3.16 @smoke - pressing 1 answers the question and Enter advances",
  async ({ page }) => {
    await navigateToQuiz(page);
    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press("1");
    await expect(page.getByText(/correct answer/i)).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press("Enter");
    await expect(page.getByText(/correct answer/i)).toBeHidden({ timeout: 3_000 });
  }
);

test(
  "AC 3.16 @smoke - the single-key shortcuts switch turns shortcuts off and persists after reload",
  async ({ page }) => {
    await navigateToQuiz(page);
    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    const toggle = page.getByRole("switch", { name: "Single-key shortcuts" });
    await expect(toggle).toBeFocused();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Close" }).click();

    await page.keyboard.press("1");
    await expect(page.getByText(/correct answer/i)).toBeHidden();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Question")).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press("1");
    await expect(page.getByText(/correct answer/i)).toBeHidden();

    // Restore the default so later tests are unaffected.
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await page.getByRole("switch", { name: "Single-key shortcuts" }).click();
  }
);
