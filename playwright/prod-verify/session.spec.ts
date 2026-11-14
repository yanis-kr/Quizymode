/**
 * AC 7.10.5: the saved sign-ins really are a signed-out visitor, a regular user and an admin. Every other prod-verify
 * spec relies on this, so a wrong account or an expired password shows up here first.
 */
import { asAdmin, asAnon, asUser, expect } from "./roles";

const NAV_TIMEOUT = { timeout: 15_000 };

asAnon("AC 7.10.5 a signed-out visitor sees neither My Progress nor Admin in the header", async ({ page }) => {
  await page.goto("/", NAV_TIMEOUT);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "My Progress" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});

asUser("AC 7.10.4, AC 7.10.5 the test user is signed in and is not an admin", async ({ page }) => {
  await page.goto("/", NAV_TIMEOUT);
  await expect(page.getByRole("link", { name: "My Progress" }).first()).toBeVisible(NAV_TIMEOUT);
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});

asAdmin("AC 7.10.4, AC 7.10.5 the test admin is signed in and sees the Admin link", async ({ page }) => {
  await page.goto("/", NAV_TIMEOUT);
  await expect(page.getByRole("link", { name: "My Progress" }).first()).toBeVisible(NAV_TIMEOUT);
  await expect(page.getByRole("link", { name: "Admin", exact: true }).first()).toBeVisible(NAV_TIMEOUT);
});
