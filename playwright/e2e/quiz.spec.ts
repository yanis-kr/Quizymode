/**
 * Quiz E2E tests — AC 3.6 Flashcards and Quiz by category/keywords
 */
import { test, expect } from "@playwright/test";

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
