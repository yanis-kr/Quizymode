import { test } from "@playwright/test";
import path from "path";
import fs from "fs";

const screenshotDir = path.resolve(
  process.cwd(),
  "docs/user-guide/screenshots/user"
);

async function capture(
  page: import("@playwright/test").Page,
  slug: string,
  url: string,
  waitFor?: string
) {
  fs.mkdirSync(screenshotDir, { recursive: true });

  try {
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    // Allow async data fetches to settle without waiting for full network idle
    await page.waitForTimeout(2_000);
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 8_000 }).catch(() => {});
    }
  } catch {
    // Navigation timeout — still attempt screenshot of current state
  }

  await page
    .screenshot({
      path: path.join(screenshotDir, `${slug}.png`),
      fullPage: true,
    })
    .catch(() => {});
}

test.describe("User guide screenshots", () => {
  test("home", async ({ page }) => {
    await capture(page, "home", "/");
  });

  test("categories", async ({ page }) => {
    await capture(page, "categories", "/categories");
  });

  test("category-detail", async ({ page }) => {
    await page.goto("/categories", { waitUntil: "load", timeout: 15_000 });
    await page.waitForTimeout(2_000);
    // Get a category-level link (2 path segments: /categories/{slug})
    const links = await page.locator("a[href^='/categories/']").all();
    let href: string | null = null;
    for (const link of links) {
      const h = await link.getAttribute("href").catch(() => null);
      if (h && h.split("/").filter(Boolean).length === 2) {
        href = h;
        break;
      }
    }
    await capture(page, "category-detail", href ?? "/categories");
  });

  test("category-keyword-group", async ({ page }) => {
    await page.goto("/categories", { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    const links = page.locator("a[href^='/categories/']");
    const count = await links.count();
    const href =
      count >= 2
        ? await links.nth(1).getAttribute("href").catch(() => null)
        : null;
    await capture(page, "category-keyword-group", href ?? "/categories");
  });

  test("add-items", async ({ page }) => {
    await capture(page, "add-items", "/items/add");
  });

  test("add-new-item", async ({ page }) => {
    await capture(page, "add-new-item", "/add-new-item");
  });

  test("bulk-create-items", async ({ page }) => {
    await capture(page, "bulk-create-items", "/items/bulk-create");
  });

  test("study-guide", async ({ page }) => {
    await capture(page, "study-guide", "/study-guide");
  });

  test("study-guide-import", async ({ page }) => {
    await capture(page, "study-guide-import", "/study-guide/import");
  });

  test("collections-mine", async ({ page }) => {
    await capture(page, "collections-mine", "/collections");
  });

  test("collections-discover", async ({ page }) => {
    await capture(page, "collections-discover", "/collections?tab=discover");
  });

  test("collection-detail", async ({ page }) => {
    await page.goto("/collections", { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    const href = await page
      .locator("a[href^='/collections/']")
      .first()
      .getAttribute("href")
      .catch(() => null);
    await capture(page, "collection-detail", href ?? "/collections");
  });

  test("about", async ({ page }) => {
    await capture(page, "about", "/about");
  });

  test("feedback", async ({ page }) => {
    await capture(page, "feedback", "/feedback");
  });
});
