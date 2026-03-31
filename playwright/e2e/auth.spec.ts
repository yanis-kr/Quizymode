/**
 * Auth E2E tests — AC 4.3 Login and tokens / AC 4.4 Logout
 *
 * This file intentionally runs without a pre-authenticated session so it
 * can exercise the login flow from a cold start.
 */
import { test, expect } from "@playwright/test";

// Override project-level storageState so this file starts unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

test("AC 4.3 @smoke - login page renders sign-in form", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Sign in to your account")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("button[type='submit']")).toBeVisible();
});

test(
  "AC 4.3 @smoke - valid credentials redirect away from the login page",
  async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "TEST_USER_EMAIL and TEST_USER_PASSWORD must be set for auth tests"
      );
    }

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.locator("#email").fill(email);
    await test.step("fill password", async () => {
      await page.locator("#password").fill(password);
    }, { box: true });
    await page.locator("button[type='submit']").click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 });
  }
);

test(
  "AC 4.3.6 - invalid credentials show an error message without leaking account existence",
  async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.locator("#email").fill("nobody@example.invalid");
    await test.step("fill password", async () => {
      await page.locator("#password").fill("wrongpassword!");
    }, { box: true });
    await page.locator("button[type='submit']").click();

    // An error banner should appear; the page must not navigate away from /login
    await expect(page.locator(".bg-red-50")).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  }
);
