/**
 * Ordinary browsing stays under the default rate limits (#904, AC 17.9), against the real API through the Development
 * DevTest identity (CI job `e2e`). The test uploads 105 private questions into one topic, browses them, and removes them.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

const HEADERS = { Authorization: "DevTest ci-user" };
const BATCHES = [100, 5];

interface Scope {
  category: string;
  keyword1: string;
  keyword2: string;
}

async function pickScope(request: APIRequestContext): Promise<Scope> {
  const response = await request.get("/api/taxonomy", { headers: HEADERS });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    categories: { slug: string; groups: { slug: string; keywords: { slug: string }[] }[] }[];
  };
  for (const category of body.categories) {
    for (const group of category.groups) {
      const keyword = group.keywords[0];
      if (keyword) return { category: category.slug, keyword1: group.slug, keyword2: keyword.slug };
    }
  }
  throw new Error("The seeded taxonomy has no category with a topic and a subtopic.");
}

async function upload(request: APIRequestContext, scope: Scope, count: number): Promise<string> {
  const items = Array.from({ length: count }, () => {
    const token = randomUUID().replace(/-/g, "");
    return {
      question: `Limits check ${token}?`,
      correctAnswer: `Right ${token}`,
      incorrectAnswers: ["Wrong one", "Wrong two", "Wrong three"],
      explanation: "",
      isPrivate: true,
    };
  });
  const response = await request.post("/api/items/upload-to-collection", {
    headers: HEADERS,
    timeout: 60_000,
    data: { ...scope, keywords: [], items, inputText: randomUUID(), collectionName: `Limits check ${randomUUID()}` },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { collectionId: string; itemCount: number };
  expect(body.itemCount).toBe(count);
  return body.collectionId;
}

async function remove(request: APIRequestContext, collectionId: string): Promise<void> {
  const response = await request.get(`/api/items?collectionId=${collectionId}&page=1&pageSize=100`, { headers: HEADERS, timeout: 30_000 });
  const body = (await response.json()) as { items: { id: string }[] };
  for (const item of body.items) await request.delete(`/api/items/${item.id}`, { headers: HEADERS, timeout: 30_000 });
  await request.delete(`/api/collections/${collectionId}`, { headers: HEADERS, timeout: 30_000 });
}

/**
 * Returns a wait for the API traffic to stop: no request pending and none started for a second. The browser's
 * "networkidle" state is reached once per navigation, often before the lists have started their requests.
 */
function trackApi(page: Page): () => Promise<void> {
  const pending = new Set<unknown>();
  let lastChange = Date.now();
  const isApi = (url: string) => new URL(url).pathname.startsWith("/api/");
  page.on("request", (request) => {
    if (!isApi(request.url())) return;
    pending.add(request);
    lastChange = Date.now();
  });
  const done = (request: unknown) => {
    if (pending.delete(request)) lastChange = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return async () => {
    await expect.poll(() => pending.size === 0 && Date.now() - lastChange > 1_000, { timeout: 60_000 }).toBe(true);
  };
}

test("AC 17.9 @e2e browsing 100 questions, studying them and filtering by rating gets no 429 with the default limits", async ({ page, request }) => {
  test.setTimeout(180_000);
  const scope = await pickScope(request);
  const collections: string[] = [];

  try {
    for (const count of BATCHES) collections.push(await upload(request, scope, count));

    const refused: string[] = [];
    let ratingStatsResponses = 0;
    page.on("response", (response) => {
      const { pathname, search } = new URL(response.url());
      if (!pathname.startsWith("/api/")) return;
      if (response.status() === 429) refused.push(`${response.request().method()} ${pathname}${search}`);
      if (/^\/api\/ratings\/[^/]+$/.test(pathname) && response.request().method() === "GET") ratingStatsResponses += 1;
    });

    const settle = trackApi(page);
    const path = `/categories/${scope.category}/${scope.keyword1}/${scope.keyword2}`;
    const nav = `nav=${scope.keyword1},${scope.keyword2}`;
    const cardCounts = page.getByRole("button", { name: /^Comments \(\d+\)$/ });

    await page.goto(`${path}?view=items&filterType=private&pagesize=100`, { timeout: 30_000 });
    await expect(cardCounts).toHaveCount(100, { timeout: 30_000 });
    await settle();
    await expect.poll(() => ratingStatsResponses, { timeout: 30_000 }).toBeGreaterThanOrEqual(100);

    await page.goto(`/explore/${scope.category}?${nav}`, { timeout: 30_000 });
    await expect(page.getByText(/Limits check [0-9a-f]{32}\?/).first()).toBeVisible({ timeout: 30_000 });
    await settle();

    await page.goto(`/quiz/${scope.category}?${nav}`, { timeout: 30_000 });
    await expect(page.getByRole("main")).toBeVisible();
    await settle();

    await page.goto(`/collections/${collections[0]}`, { timeout: 30_000 });
    await expect(cardCounts.first()).toBeVisible({ timeout: 30_000 });
    await settle();

    const beforeFilter = ratingStatsResponses;
    await page.goto(`${path}?view=items&filterType=private&pagesize=100&ratingOnlyUnrated=1`, { timeout: 30_000 });
    await expect(cardCounts).toHaveCount(100, { timeout: 30_000 });
    await settle();
    // The filter loads statistics for every question in the scope, not only the shown page.
    await expect.poll(() => ratingStatsResponses - beforeFilter, { timeout: 30_000 }).toBeGreaterThanOrEqual(105);

    const afterFilter = ratingStatsResponses;
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/ratings\//.test(response.url()));
    await page.getByTitle("Rate 5 stars").first().click();
    expect((await saved).status()).toBeLessThan(300);
    await settle();
    // AC 17.11: rating one question does not reload the statistics of the others.
    expect(ratingStatsResponses - afterFilter).toBeLessThan(10);

    expect(refused).toEqual([]);
  } finally {
    for (const collectionId of collections) await remove(request, collectionId);
  }
});
