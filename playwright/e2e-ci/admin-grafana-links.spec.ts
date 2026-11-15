/** Admin Operations dashboards (#641, AC 5.14.3): a non-admin (DevTest ci-user) never sees the Grafana links. */
import { test, expect } from "../fixtures";

test("AC 5.14.3 a non-admin is redirected from /admin and sees no Operations dashboards section", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Operations dashboards" })).toHaveCount(0);
  await expect(page.locator('a[href*="/d/quizymode-media"]')).toHaveCount(0);
});
