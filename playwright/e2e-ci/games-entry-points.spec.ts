/** Games entry points for anonymous visitors (#675, AC 3.35.1, AC 3.35.2). */
import { test, expect } from "../fixtures";

test("AC 3.35.1 the signed-out navigation includes a Games link to /games", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation").first();
  const games = nav.getByRole("link", { name: "Games", exact: true });
  await expect(games).toHaveAttribute("href", "/games");
  await games.click();
  await expect(page).toHaveURL(/\/games$/);
});

test("AC 3.35.2 Home shows a Play a game tile that opens /games", async ({ page }) => {
  await page.goto("/");
  const tile = page.getByRole("link", { name: "Play a game", exact: true });
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute("href", "/games");
});
