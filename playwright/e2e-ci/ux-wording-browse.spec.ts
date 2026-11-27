/**
 * Browse screens say questions and topics (#922). The e2e-ci web build signs in as the DevTest identity, so these
 * signed-out tests serve a copy of that one module which reports no identity. Every API call is stubbed with data that
 * contains none of the checked words, so any match comes from the app's own wording.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const OLD_WORDS = /\b(item|items|sets)\b/i;

async function signOut(page: Page): Promise<void> {
  await page.route(/\/src\/api\/devTestAuth\.ts(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: [
        "export const parseDevTestUser = () => null;",
        "export const devTestIdentity = () => null;",
        "export const devTestAuthorization = () => null;",
      ].join("\n"),
    }),
  );
}

const questions = Array.from({ length: 3 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  category: "geography",
  isPrivate: false,
  question: `Which city is the capital of country ${index + 1}?`,
  correctAnswer: `City ${index + 1}`,
  incorrectAnswers: [`Town ${index + 1}`, `Port ${index + 1}`, `Village ${index + 1}`],
  explanation: "A short fact.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [],
  collections: [],
}));

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";

const topic = (name: string, navigationRank: number) => ({
  name,
  itemCount: 12,
  averageRating: null,
  navigationRank,
  description: null,
});

const featured = {
  sets: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "World Capitals",
      categorySlug: "geography",
      navKeyword1: "capitals",
      navKeyword2: null,
      itemCount: 12,
      lastModifiedAt: null,
      sortOrder: 1,
    },
  ],
  collections: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      collectionId: COLLECTION_ID,
      displayName: "Capital Clues",
      description: "Cities from short clues.",
      itemCount: 1,
      lastModifiedAt: "2026-01-02T00:00:00Z",
      sortOrder: 1,
    },
  ],
};

const searchResults = {
  query: "capital",
  groups: {
    categories: { results: [], hasMore: false },
    subcategories: {
      results: [{ categorySlug: "geography", l1: "capitals", l2: null, description: "Capital cities", itemCount: 12 }],
      hasMore: false,
    },
    collections: {
      results: [{ id: COLLECTION_ID, name: "Capital Clues", description: "Cities from short clues.", itemCount: 1 }],
      hasMore: false,
    },
    items: {
      results: [
        {
          id: questions[0].id,
          snippet: { text: questions[0].question, highlights: [] },
          categorySlug: "geography",
          l1: "capitals",
          l2: null,
        },
      ],
      hasMore: false,
    },
    mine: null,
  },
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/categories") {
      return json({ categories: [{ category: "geography", count: 12, description: "Countries and capitals", averageRating: null }] });
    }
    if (pathname === "/api/taxonomy") {
      return json({
        categories: [
          {
            slug: "geography",
            name: "geography",
            description: "Countries and capitals",
            itemCount: 12,
            allKeywordSlugs: ["capitals", "europe"],
            groups: [
              {
                slug: "capitals",
                description: "Capital cities",
                itemCount: 12,
                keywords: [{ slug: "europe", description: null, itemCount: 12 }],
              },
            ],
          },
        ],
      });
    }
    if (pathname === "/api/keywords") {
      const selected = url.searchParams.get("selectedKeywords");
      if (!selected) return json({ keywords: [topic("capitals", 1)] });
      return json({ keywords: selected === "capitals" ? [topic("europe", 2)] : [] });
    }
    if (pathname === "/api/keywords/descriptions") return json({ keywords: [{ name: "capitals", description: "Capital cities" }] });
    if (pathname === "/api/keywords/item-tags") return json({ names: [] });
    if (pathname === "/api/items") return json({ items: questions, totalCount: 12, page: 1, pageSize: 10, totalPages: 2 });
    if (pathname === "/api/featured") return json(featured);
    if (pathname === "/api/search") return json(searchResults);
    if (pathname === "/api/home/popular-categories") return json({ categories: ["geography"] });
    if (pathname === "/api/collections/discover") {
      return json({
        items: [
          {
            id: COLLECTION_ID,
            name: "Capital Clues",
            description: "Cities from short clues.",
            createdBy: "someone",
            createdAt: "2026-01-01T00:00:00Z",
            itemCount: 1,
            isBookmarked: false,
          },
        ],
        totalCount: 1,
      });
    }
    const collectionId = /^\/api\/collections\/([0-9a-f-]{36})$/.exec(pathname)?.[1];
    if (collectionId) {
      return json({
        id: collectionId,
        name: "Capital Clues",
        description: "Cities from short clues.",
        createdBy: "someone",
        createdAt: "2026-01-01T00:00:00Z",
        itemCount: 12,
        isPublic: true,
      });
    }
    if (pathname === "/api/starter-pool") {
      return json({
        version: "test",
        items: [{ world: "geography", wowLine: "A short fact.", item: { ...questions[0], source: "https://example.org/capitals" } }],
      });
    }
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings\/[^/]+$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
    if (pathname === "/api/comments") return json({ comments: [], totalCount: 0 });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

/**
 * Runs in the page: the title, the description metadata, the text of every element and every accessible-name attribute.
 * Hidden and screen-reader-only text is read too, so the check is stricter than what is on screen.
 */
function readWording(): string[] {
  const found: string[] = [document.title];
  document
    .querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')
    .forEach((meta) => found.push(meta.getAttribute("content") ?? ""));
  document.body.querySelectorAll("*").forEach((element) => {
    if (element.closest("script, style, noscript")) return;
    const ownText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("");
    found.push(ownText);
    for (const attribute of ["aria-label", "aria-description", "aria-valuetext", "title", "placeholder", "alt"]) {
      found.push(element.getAttribute(attribute) ?? "");
    }
  });
  return found;
}

async function expectNewWording(page: Page, screen: string): Promise<void> {
  const offending = (await page.evaluate(readWording)).filter((text) => OLD_WORDS.test(text));
  expect(offending, `old wording on ${screen}`).toEqual([]);
}

async function open(page: Page, url: string): Promise<void> {
  await signOut(page);
  await stubApi(page);
  await page.goto(url);
}

/** The first content of a route may wait for the dev server to compile its modules. */
const FIRST = { timeout: 10_000 };

test.describe("Browse screens wording (#922)", () => {
  test.describe.configure({ timeout: 45_000 });

  test("AC 3.4.13 Home says questions and topics", async ({ page }) => {
    await open(page, "/");
    await expect(page.getByText("Featured topics", { exact: true })).toBeVisible(FIRST);
    await expect(page.getByText("12 questions", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1 question", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /World Capitals/ }).first()).toBeVisible();
    await expectNewWording(page, "/");
  });

  test("AC 3.4.13 Categories and its map say questions", async ({ page }) => {
    await open(page, "/categories");
    await expect(page.getByRole("button", { name: /\b12 questions\b/ })).toBeVisible(FIRST);
    await expectNewWording(page, "/categories");

    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("12 questions").first()).toBeVisible();
    await expectNewWording(page, "the categories map");
  });

  test("AC 3.4.13 a category page and a topic page say questions and topics in the Topics view", async ({ page }) => {
    await open(page, "/categories/geography");
    await expect(page.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "true", FIRST);
    await expect(page.getByRole("button", { name: /capitals/i }).filter({ hasText: "12 questions" })).toBeVisible();
    await expectNewWording(page, "/categories/geography");

    await page.goto("/categories/geography/capitals?view=sets");
    await expect(page.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "true", FIRST);
    await expect(page.getByRole("button", { name: /europe/i }).filter({ hasText: "12 questions" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Play these questions" })).toBeVisible();
    await expectNewWording(page, "the topic page, Topics view");
  });

  test("AC 3.4.13 a topic page List view and its filters say questions", async ({ page }) => {
    await open(page, "/categories/geography/capitals?view=items");
    await expect(page.getByText(questions[0].question)).toBeVisible(FIRST);
    await expect(page.getByText("Browse questions in this scope.")).toBeVisible();
    await expectNewWording(page, "the topic page, List view");

    await page.getByRole("button", { name: /^Filters/ }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    for (const name of ["Visibility", "Text Search", "Rating"]) {
      await filters.getByRole("button", { name }).click();
    }
    await expect(filters.getByText("Only questions with no rating")).toBeVisible();
    await expectNewWording(page, "the List view filters");
  });

  test("AC 3.4.13 Featured says questions and topics on both tabs", async ({ page }) => {
    await open(page, "/featured");
    await expect(page.getByRole("button", { name: "Topics", exact: true })).toBeVisible(FIRST);
    await expect(page.getByRole("button", { name: /World Capitals/ })).toContainText("12 questions");
    await expectNewWording(page, "/featured, Topics tab");

    await page.getByRole("button", { name: "Collections", exact: true }).click();
    await expect(page.getByRole("button", { name: /Capital Clues/ })).toContainText("1 question");
    await expectNewWording(page, "/featured, Collections tab");
  });

  test("AC 3.4.13 search results say questions", async ({ page }) => {
    await open(page, "/search?q=capital");
    await expect(page.getByRole("heading", { level: 2, name: "Questions" })).toBeVisible(FIRST);
    await expect(page.getByRole("link", { name: /Capital Clues/ })).toContainText("1 question");
    await expectNewWording(page, "/search");
  });

  test("AC 3.4.13 About says questions and topics", async ({ page }) => {
    await open(page, "/about");
    await expect(page.getByRole("link", { name: "All featured topics" })).toBeVisible(FIRST);
    await expect(page.getByTestId("about-collection-count").first()).toHaveText("12 questions");
    await expect(page.getByTestId("about-hook-question")).toHaveText(questions[0].question);
    await expectNewWording(page, "/about");
  });
});
