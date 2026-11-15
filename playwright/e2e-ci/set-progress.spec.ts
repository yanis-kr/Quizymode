/** Per-set progress (#672, AC 3.33.3): a guest set with every item known shows a completed state on the set landing page. */
import { test, expect } from "../fixtures";

const KNOWN_KEY = "quizymode.known.v1";

test("AC 3.33.3 @e2e a guest set with every item known shows a completed state", async ({ page, request }) => {
  const response = await request.get("/api/items?page=1&pageSize=1");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { category: string }[] };
  expect(body.items.length).toBeGreaterThan(0);
  const slug = body.items[0]!.category.toLowerCase().replace(/\s+/g, "-");

  await page.goto(`/categories/${encodeURIComponent(slug)}`);
  const countLine = page.getByText(/^[\d,]+ questions?$/);
  await expect(countLine).toBeVisible({ timeout: 15_000 });
  const total = Number((await countLine.innerText()).split(" ")[0]!.replace(/,/g, ""));
  expect(total).toBeGreaterThan(0);

  const ids = Array.from({ length: Math.min(total, 1000) }, (_, i) => `known-${i}`);
  await page.addInitScript(
    ([key, setKey, stored]) => {
      window.localStorage.setItem(key as string, JSON.stringify({ [setKey as string]: stored }));
    },
    [KNOWN_KEY, `s/${slug}`, ids] as const,
  );
  await page.reload();
  const progress = page.getByTestId("set-progress");
  if (total <= 1000) {
    await expect(progress).toHaveAttribute("data-complete", "true", { timeout: 15_000 });
    await expect(progress).toContainText("Completed");
  } else {
    await expect(progress).toHaveAttribute("data-complete", "false", { timeout: 15_000 });
    await expect(progress).toContainText(`1,000 of ${total.toLocaleString()} known`);
  }
});
