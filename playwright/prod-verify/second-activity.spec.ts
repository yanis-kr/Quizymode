/**
 * AC 5.4.20: as an admin on prod, the Funnel tab of Usage Analytics shows the Second activity panel for the last 14 days.
 * Runs only with the saved admin sign-in (roles.ts); it reads the page and changes nothing.
 */
import { asAdmin, expect } from "./roles";

const NAV_TIMEOUT = { timeout: 15_000 };

asAdmin("AC 5.4.20 the Funnel tab shows the Second activity panel for the admin", async ({ page }) => {
  await page.goto("/admin/page-views?tab=funnel", NAV_TIMEOUT);
  await page.waitForLoadState("networkidle");
  const panel = page.getByRole("region", { name: "Second activity" });
  await expect(panel).toBeVisible(NAV_TIMEOUT);
  await expect(panel.getByRole("heading", { name: "Second activity" })).toBeVisible();
});
