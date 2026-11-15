/** State-aware Home for returning visitors (#670, AC 3.31.1, AC 3.31.4). */
import { test, expect } from "../fixtures";

// The e2e-ci stack signs in as the DevTest identity at build time, so there is no guest; the completed quiz comes from
// the account's study sessions instead (AC 3.31.1 covers guests and signed-in accounts alike).
const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  origin: "quiz",
  runId: "e2e-next-up-run",
  completedAt: new Date(Date.now() - 60_000).toISOString(),
  correct: 3,
  total: 5,
  source: { kind: "global", filterKeywords: [] },
  missedItemIds: [],
  mode: "quiz",
};

test("AC 3.31.1 an account with a completed quiz sees one Next up card instead of the first-visit hero", async ({ page }) => {
  await page.route(/\/api\/study-sessions(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [SESSION] }),
    });
  });
  await page.goto("/");
  const card = page.getByTestId("next-up-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("Next up", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn something new in five questions." })).toHaveCount(0);
});

test("AC 3.31.4 a visitor with no completed quiz still sees the first-visit hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Learn something new in five questions." })).toBeVisible();
  await expect(page.getByTestId("next-up-card")).toHaveCount(0);
});
