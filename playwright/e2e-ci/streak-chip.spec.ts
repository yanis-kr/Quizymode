/** Streak chip in the header (#671, AC 3.32.1). */
import { test, expect } from "../fixtures";

test("AC 3.32.1 the header shows the guest's streak on every page once it is 1 or more", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript((date) => {
    window.localStorage.setItem(
      "quizymode.daily.v1",
      JSON.stringify({ version: 1, completions: [{ date, correct: 3, total: 5 }] }),
    );
  }, today);

  for (const path of ["/", "/categories", "/games"]) {
    await page.goto(path);
    const chip = page.getByTestId("streak-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAccessibleName("1-day streak");
  }
});

test("AC 3.32.1 the header shows no streak chip before the first daily quiz", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("streak-chip")).toHaveCount(0);
});
