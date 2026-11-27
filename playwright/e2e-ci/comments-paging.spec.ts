/**
 * Comment counts, paging and refused saves (#904, AC 2.5.11, AC 2.5.16, AC 2.5.17), signed in through the Development
 * DevTest identity (CI job `e2e`). The item is real; `/api/comments` is answered by a route stub with 55 comments in two
 * pages, so the test does not write comments or spend the daily quota.
 */
import { test, expect } from "../fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

const DEV_TEST_HEADER = "DevTest ci-user";
const TOTAL = 55;
const REFUSAL = "You have reached the daily limit of 100 comments. Try again tomorrow.";

const comments = Array.from({ length: TOTAL }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  itemId: "stub",
  text: `Stub comment number ${index + 1}.`,
  createdBy: "00000000-0000-4000-8000-000000000999",
  createdByName: "Stub author",
  createdAt: "2026-01-01T00:00:00Z",
}));

async function stubComments(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/comments",
    async (route) => {
      if (route.request().method() !== "GET") {
        return route.fulfill({
          status: 429,
          contentType: "application/problem+json",
          headers: { "Retry-After": "3600" },
          body: JSON.stringify({ title: "Quota.CommentsPerDay", detail: REFUSAL, status: 429 }),
        });
      }
      const params = new URL(route.request().url()).searchParams;
      const pageNumber = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "50");
      const start = (pageNumber - 1) * pageSize;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          comments: comments.slice(start, start + pageSize),
          totalCount: TOTAL,
          page: pageNumber,
          pageSize,
        }),
      });
    },
  );
}

/** The dev server compiles a page on its first visit, which can outlast the default navigation timeout. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { timeout: 30_000 });
}

async function firstItem(request: APIRequestContext): Promise<{ id: string; category: string }> {
  const response = await request.get("/api/items?page=1&pageSize=1", { headers: { Authorization: DEV_TEST_HEADER } });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { id: string; category: string }[] };
  expect(body.items.length).toBeGreaterThan(0);
  return body.items[0]!;
}

const countButton = (page: Page) => page.getByRole("button", { name: `Comments (${TOTAL})`, exact: true }).first();
const loadOlder = (page: Page) => page.getByRole("button", { name: "Load older comments" });
const shownComments = (page: Page) => page.getByText(/^Stub comment number \d+\.$/);

async function expectTwoPages(page: Page): Promise<void> {
  await expect(shownComments(page)).toHaveCount(50, { timeout: 10_000 });
  await loadOlder(page).click();
  await expect(shownComments(page)).toHaveCount(TOTAL, { timeout: 10_000 });
  expect(new Set(await shownComments(page).allTextContents()).size).toBe(TOTAL);
  await expect(loadOlder(page)).toHaveCount(0);
}

test("AC 2.5.11 @e2e item cards and the item detail page count every comment, not the loaded ones", async ({ page, request }) => {
  const item = await firstItem(request);
  await stubComments(page);

  await open(page, `/categories/${encodeURIComponent(item.category.toLowerCase())}?view=items`);
  await expect(countButton(page)).toBeVisible({ timeout: 10_000 });

  await open(page, `/items/${item.id}`);
  await expect(countButton(page)).toBeVisible({ timeout: 10_000 });
});

test("AC 2.5.16 @e2e the comments drawer shows the newest 50 and loads the rest on request", async ({ page, request }) => {
  const item = await firstItem(request);
  await stubComments(page);
  await open(page, `/items/${item.id}`);

  await countButton(page).click();

  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  await expectTwoPages(page);
});

test("AC 2.5.16 @e2e the comments page shows the newest 50 and loads the rest on request", async ({ page, request }) => {
  const item = await firstItem(request);
  await stubComments(page);

  await open(page, `/items/${item.id}/comments`);

  await expectTwoPages(page);
});

test("AC 2.5.17 @e2e a refused comment shows the server message and keeps the typed text", async ({ page, request }) => {
  const item = await firstItem(request);
  await stubComments(page);
  await open(page, `/items/${item.id}/comments`);
  const box = page.getByPlaceholder("Write your comment...");
  await box.fill("A comment that is refused");

  await page.getByRole("button", { name: "Post Comment" }).click();

  await expect(page.getByRole("alert").filter({ hasText: REFUSAL })).toBeVisible();
  await expect(box).toHaveValue("A comment that is refused");
  await expect(page.getByRole("button", { name: "Post Comment" })).toBeEnabled();
});
