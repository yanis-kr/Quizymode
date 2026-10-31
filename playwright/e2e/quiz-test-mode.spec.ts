/**
 * Quiz Test option E2E - AC 3.18.1, 3.18.2, 3.18.4, 3.18.7 on a 375 px viewport.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

test.use({ viewport: { width: 375, height: 812 } });

test("AC 3.18 @smoke - Test setup, palette sheet and Submit dialog fit a 375 px viewport", async ({ page }) => {
  await page.goto("/quiz?mode=test");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("radio", { name: "Test" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Test mode" })).toBeVisible();
  await page.getByRole("button", { name: "Start test" }).click();

  const paletteToggle = page.getByRole("button", { name: /^Questions 1 of/ });
  await expect(paletteToggle).toBeVisible();
  await paletteToggle.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paletteToggle).toBeFocused();

  await page.getByRole("button", { name: "Submit test" }).click();
  await expect(page.getByRole("dialog", { name: "Submit test?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to test" })).toBeFocused();

  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
});

interface SavedTestRun {
  identityKey?: string;
  startedAt: string | null;
  timeLimitSec: number | null;
  flagged: string[];
}

async function readSavedTestRun(page: Page): Promise<SavedTestRun | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("navigationContext_quiz");
    if (!raw) return null;
    const context = JSON.parse(raw) as { quizRun?: SavedTestRun };
    return context.quizRun ?? null;
  });
}

async function startSizedTestAndReload(
  page: Page,
  size: number | null,
  expectedIdentityPrefix: "guest" | "user:"
): Promise<void> {
  await page.goto("/quiz?mode=test");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Test mode" })).toBeVisible();

  const sizeInput = page.getByLabel("Quiz size:");
  if (size !== null) {
    await sizeInput.fill(String(size));
    await sizeInput.blur();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Test mode" })).toBeVisible();
  }
  await expect(sizeInput).toHaveValue(String(size ?? 10));

  await page.getByLabel("Time limit").selectOption("per-2");
  await page.getByRole("button", { name: "Start test" }).click();
  await page.getByRole("button", { name: "Flag for review" }).click();
  await expect
    .poll(async () => {
      const run = await readSavedTestRun(page);
      return run?.startedAt !== null && run?.startedAt !== undefined && run.flagged.length === 1;
    })
    .toBe(true);
  const before = await readSavedTestRun(page);
  // A stale auth file would silently turn the signed-in cases into guest runs.
  expect(before?.identityKey?.startsWith(expectedIdentityPrefix)).toBe(true);

  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Start test" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Flag for review" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(sizeInput).toHaveValue(String(size ?? 10));
  await expect(sizeInput).toBeDisabled();

  const after = await readSavedTestRun(page);
  expect(after?.identityKey).toBe(before?.identityKey);
  expect(after?.startedAt).toBe(before?.startedAt);
  expect(after?.timeLimitSec).toBe(before?.timeLimitSec);
  expect(after?.flagged).toEqual(before?.flagged);
}

test.describe("AC 3.18.7 reload as a guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a started Test with quiz size 5 restores its flag, size and deadline after a reload", async ({ page }) => {
    await startSizedTestAndReload(page, 5, "guest");
  });

  test("a started Test with the default quiz size 10 restores after a reload", async ({ page }) => {
    await startSizedTestAndReload(page, null, "guest");
  });
});

test.describe("AC 3.18.7 reload when signed in (#393)", () => {
  test("a started Test with quiz size 5 restores its flag, size and deadline after a reload", async ({ page }) => {
    await startSizedTestAndReload(page, 5, "user:");
  });

  test("a started Test with the default quiz size 10 restores after a reload", async ({ page }) => {
    await startSizedTestAndReload(page, null, "user:");
  });
});
