/**
 * Funnel telemetry E2E — AC 5.4.9 / 5.4.10: an anonymous quiz emits one start and one completion for
 * the same run, then the signup prompt records a view and a click, all in one analytics session.
 * Events are observed on the wire only; the requests are not altered.
 */
import { test, expect } from "../fixtures";

interface CapturedBatch {
  sessionId: string;
  events: Array<{ name: string; runId?: string; contextType?: string; contextId?: string }>;
}

test.describe("anonymous quiz to signup-prompt funnel", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("AC 5.4.9 @smoke - records quiz start/completion and the signup prompt view and click in one session", async ({
    page,
  }) => {
    const batches: CapturedBatch[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/analytics/events")) return;
      try {
        batches.push(JSON.parse(request.postData() ?? "") as CapturedBatch);
      } catch {
        // Ignore bodies that are not JSON batches.
      }
    });
    const names = () => batches.flatMap((batch) => batch.events.map((event) => event.name));

    await page.goto("/quiz/collections/8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511/fun+trivia+facts");

    for (let index = 0; index < 5; index += 1) {
      await expect(page.locator("h3", { hasText: "Question" })).toBeVisible({ timeout: 10_000 });
      // Any option works: the funnel only cares that the run is completed.
      await page.locator('button[type="button"]').filter({ hasText: /^\s*A\./ }).first().click();
      await expect(page.getByText(/correct answer:/i)).toBeVisible();
      if (index < 4) {
        await page.getByRole("button", { name: /^next$/i }).click();
      }
    }
    await page.getByRole("button", { name: /view results/i }).click();

    const prompt = page.getByTestId("signup-prompt");
    await expect(prompt).toBeVisible();
    await expect.poll(() => names().filter((name) => name === "signup_prompt_viewed").length).toBe(1);

    await prompt.getByRole("link", { name: /create/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
    await expect.poll(() => names().includes("signup_prompt_clicked")).toBe(true);

    const events = batches.flatMap((batch) => batch.events);
    expect(names().filter((name) => name === "quick_quiz_started")).toHaveLength(1);
    expect(names().filter((name) => name === "quiz_completed")).toHaveLength(1);
    const started = events.find((event) => event.name === "quick_quiz_started");
    const completed = events.find((event) => event.name === "quiz_completed");
    expect(started?.runId).toBeTruthy();
    expect(completed?.runId).toBe(started?.runId);
    expect(new Set(batches.map((batch) => batch.sessionId)).size).toBe(1);
  });
});
