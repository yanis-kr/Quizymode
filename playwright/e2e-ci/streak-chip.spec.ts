/** Streak chip in the header (#671, AC 3.32.1). */
import { test, expect } from "../fixtures";

// The e2e-ci stack signs in as the DevTest identity at build time, so the chip shows the account streak from the daily quiz API.
test("AC 3.32.1 the header shows the account streak on every page once it is 1 or more", async ({ page }) => {
  await page.route("**/api/daily-quiz", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-11-02",
        items: [],
        completion: { correct: 3, total: 5, completedAt: "2026-11-02T10:00:00Z" },
        streak: 2,
      }),
    });
  });

  for (const path of ["/", "/categories", "/games"]) {
    await page.goto(path);
    const chip = page.getByTestId("streak-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAccessibleName("2-day streak");
  }
});

test("AC 3.32.1 the header shows no streak chip before the first daily quiz", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("streak-chip")).toHaveCount(0);
});
