/** State-aware Home for returning visitors (#670, AC 3.31.1, AC 3.31.4). */
import { test, expect } from "../fixtures";

const GUEST_HISTORY = {
  version: 2,
  summaries: [
    {
      runId: "e2e-next-up-run",
      completedAt: new Date(Date.now() - 60_000).toISOString(),
      correct: 3,
      total: 5,
      source: { kind: "global", filterKeywords: [] },
      missedItemIds: [],
      mode: "quiz",
    },
  ],
};

test("AC 3.31.1 a guest with a completed quiz sees one Next up card instead of the first-visit hero", async ({ page }) => {
  await page.addInitScript((doc) => {
    window.localStorage.setItem("quizymode.guest.v1", JSON.stringify(doc));
  }, GUEST_HISTORY);
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
