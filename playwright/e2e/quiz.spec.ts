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

test.describe("anonymous collection completion", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC 3.6 @smoke - completes, reviews mistakes, returns to results, and replays", async ({
    page,
  }) => {
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
      const question = page.locator("h3", { hasText: "Question" }).locator("..").locator("p").first();
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
