import { expect, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("AC 3.0 @smoke - anonymous visitor can start the five-question home quiz", async ({
  page,
}) => {
  await page.goto("/");

  const quickQuizLink = page.getByRole("link", { name: /play a 5-question quiz/i });
  await expect(quickQuizLink).toBeVisible();
  await expect(page.getByText(/no account needed/i)).toBeVisible();

  await quickQuizLink.click();

  await expect(page).toHaveURL(
    /\/quiz\/collections\/8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511\/fun\+trivia\+facts/
  );
  // Role + exact name: the collection description on the quiz page also contains "question" (#152).
  await expect(page.getByRole("heading", { name: "Question", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/^\s*A\./).first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
});

// 195 px wide is a 390 px phone at 200% zoom (#151).
for (const [width, height] of [
  [195, 422],
  [260, 450],
  [320, 568],
  [390, 844],
] as const) {
  test(`AC 3.0.4 - home has no horizontal overflow at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // The hero grows when the featured and collections lanes render, which stretches the
    // rotated decorative shapes; measure only after both lane queries have settled.
    const lanesSettled = Promise.all([
      page.waitForResponse((r) => /\/featured(?:\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.waitForResponse((r) => /\/collections\/discover(?:\?|$)/.test(r.url()), {
        timeout: 10_000,
      }),
    ]);
    await page.goto("/");
    await lanesSettled;

    const quickQuizLink = page.getByRole("link", { name: /play a 5-question quiz/i });
    await expect(quickQuizLink).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}
