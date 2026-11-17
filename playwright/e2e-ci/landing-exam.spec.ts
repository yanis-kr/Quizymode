/**
 * Exam landing (#714, AC1, AC2, AC7) on /categories/exams/aws/saa-c03 for a signed-out visitor. The API is stubbed so
 * the count, the featured name and the items are fixed and do not depend on the catalog.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const SAA_NAV = ["aws", "saa-c03"];

const item = {
  id: "22222222-2222-2222-2222-222222222222",
  category: "Exams",
  isPrivate: false,
  question: "Which service gives shared file storage to many EC2 instances?",
  correctAnswer: "Amazon EFS",
  incorrectAnswers: ["Amazon EBS", "Amazon S3 Glacier"],
  explanation: "EFS is a shared network file system.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [{ id: "k0", name: "aws", isPrivate: false }],
  collections: [],
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/categories")) {
      return json({ categories: [{ category: "Exams", count: 652, description: "Certification exam practice", averageRating: null }] });
    }
    if (pathname.endsWith("/api/items")) {
      return json({ items: [item], totalCount: 652, page: 1, pageSize: 1, totalPages: 652 });
    }
    if (pathname.endsWith("/api/featured")) {
      return json({
        sets: [
          {
            id: "f1",
            displayName: "AWS SAA-C03",
            categorySlug: "exams",
            navKeyword1: "aws",
            navKeyword2: "saa-c03",
            itemCount: 652,
            lastModifiedAt: null,
            sortOrder: 1,
          },
        ],
        collections: [],
      });
    }
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/keywords/item-tags")) return json({ names: [] });
    if (pathname.endsWith("/api/games/roster")) return json({ items: [], scopes: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings\/[^/]+$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
    if (pathname.endsWith("/api/comments")) return json({ comments: [], totalCount: 0 });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test.describe("Exam landing (#714)", () => {
  test("AC 3.6.25 the SAA-C03 landing shows the full name, a one-sentence description and the unofficial line", async ({ page }) => {
    await stubApi(page);
    await page.goto("/categories/exams/aws/saa-c03?view=items");
    await expect(page.getByRole("heading", { level: 1, name: "AWS SAA-C03" })).toBeVisible();
    await expect(
      page.getByText("Practice questions for the AWS Certified Solutions Architect Associate exam (SAA-C03).")
    ).toBeVisible();
    await expect(page.getByText("Unofficial practice questions. Not affiliated with the exam provider.")).toBeVisible();
  });

  test("AC 3.6.26 Exam simulation opens the Test mode setup card for a signed-out visitor", async ({ page }) => {
    await stubApi(page);
    await page.goto("/categories/exams/aws/saa-c03?view=items");
    await page.getByRole("link", { name: "Exam simulation" }).click();
    // The path keywords travel in nav=, so the quiz route is /quiz/exams with mode=test.
    await expect(page).toHaveURL(/\/quiz\/exams.*mode=test/);
    await expect(page.getByRole("heading", { level: 2, name: "Test mode" })).toBeVisible();
  });

  test("AC 3.6.27 the landing has no horizontal scroll at 320 px, one h1 and wrapped buttons", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await stubApi(page);
    await page.goto("/categories/exams/aws/saa-c03?view=items");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Exam simulation" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
