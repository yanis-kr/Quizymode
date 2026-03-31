import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.resolve(process.cwd(), "playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables must be set"
    );
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.locator("#email").fill(email);
  await setup.step("fill password", async () => {
    await page.locator("#password").fill(password);
  }, { box: true });
  await page.locator("button[type='submit']").click();

  // Wait for redirect away from /login after successful sign-in
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  await page.context().storageState({ path: authFile });
});
