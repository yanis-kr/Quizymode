import { test as setup, expect } from "../fixtures";
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

  // The test account must accept the current Terms and Privacy Policy (AC 4.6.8). The dialog title differs for a
  // first acceptance and a re-acceptance after a version bump (AC 4.6.9), so match both;
  // otherwise the blocking prompt covers every page captured or tested later.
  const policyPrompt = page.getByRole("dialog", {
    name: /our terms and privacy policy/i,
  });
  if (await policyPrompt.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    await policyPrompt.getByRole("button", { name: /accept and continue/i }).click();
    await expect(policyPrompt).toBeHidden({ timeout: 15_000 });
  }

  await page.context().storageState({ path: authFile });
});
