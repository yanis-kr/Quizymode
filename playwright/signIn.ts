import fs from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** A test account read from environment variables. The values are never logged or put in a test title. */
export interface TestAccount {
  email: string;
  password: string;
}

/** The first non-empty variable of each list, or null when either is missing. */
export function accountFromEnv(emailVars: string[], passwordVars: string[]): TestAccount | null {
  const first = (names: string[]): string | undefined => names.map((name) => process.env[name]).find((value) => !!value);
  const email = first(emailVars);
  const password = first(passwordVars);
  return email && password ? { email, password } : null;
}

/**
 * Signs in through the app's own /login page and saves the browser state (Amplify keeps its tokens in localStorage).
 * The state file is a secret: it stays under the git-ignored playwright/.auth/ and is never printed or uploaded.
 */
export async function signInAndSave(page: Page, account: TestAccount, stateFile: string): Promise<void> {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  // A failed sign-in must not leave an older state behind that later tests would silently reuse.
  fs.rmSync(stateFile, { force: true });

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.locator("#email").fill(account.email);
  await test.step("fill password", async () => {
    await page.locator("#password").fill(account.password);
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

  await page.context().storageState({ path: stateFile });
}
