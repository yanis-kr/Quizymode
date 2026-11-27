/**
 * Study and collection screens say questions (#923). The e2e-ci web build signs in as the DevTest identity, so these
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
const COLLECTION_NAME = "Capital Clues";
const SLUG = "capital+clues";

const collection = {
  id: COLLECTION_ID,
  name: COLLECTION_NAME,
  description: "Cities from short clues.",
  createdBy: "someone",
  createdAt: "2026-01-01T00:00:00Z",
  itemCount: questions.length,
  isPublic: true,
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const { pathname } = new URL(route.request().url());
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/categories") {
      return json({ categories: [{ category: "geography", count: 3, description: "Countries and capitals", averageRating: null }] });
    }
    if (pathname === "/api/items") return json({ items: questions, totalCount: questions.length, page: 1, pageSize: 1000, totalPages: 1 });
    const question = questions.find((candidate) => pathname === `/api/items/${candidate.id}`);
    if (question) return json(question);
    if (pathname === "/api/collections/discover") return json({ items: [{ ...collection, isBookmarked: false }], totalCount: 1 });
    if (pathname === `/api/collections/${COLLECTION_ID}`) return json(collection);
    if (pathname === `/api/collections/${COLLECTION_ID}/collections`) return json({ children: [], hiddenCollectionCount: 0 });
    if (pathname === `/api/collections/${COLLECTION_ID}/topics`) return json([]);
    if (pathname === `/api/collections/${COLLECTION_ID}/rating`) return json({ count: 0, averageStars: null, myStars: null });
    if (/^\/api\/ratings\/[^/]+\/me$/.test(pathname)) return json(null);
    if (/^\/api\/ratings(\/[^/]+)?$/.test(pathname)) return json({ stats: { count: 0, averageStars: null, itemId: null } });
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

/** Opens the "Collection details" dialog, checks it counts under Questions, and checks its wording. */
async function expectDetailsWording(page: Page, screen: string): Promise<void> {
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.locator("dt").filter({ hasText: /^Questions$/ })).toBeVisible();
  await expectNewWording(page, `${screen}, collection details`);
}

test.describe("Study and collection screens wording (#923)", () => {
  test.describe.configure({ timeout: 45_000 });

  test("AC 3.6.48 Discover and its filters say questions", async ({ page }) => {
    await open(page, "/collections");
    await expect(page.getByRole("heading", { level: 3, name: COLLECTION_NAME })).toBeVisible(FIRST);
    await expect(page.getByText("3 questions", { exact: true })).toBeVisible();
    await expectNewWording(page, "/collections");

    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByLabel("Question tags")).toBeVisible();
    await expectNewWording(page, "the Discover filters");
  });

  test("AC 3.6.48 a collection page says questions", async ({ page }) => {
    await open(page, `/collections/${COLLECTION_ID}/${SLUG}`);
    await expect(page.getByText(questions[0].question)).toBeVisible(FIRST);
    await expect(page.getByRole("group", { name: "Play these questions" })).toBeVisible();
    await expect(page.getByText("3 questions", { exact: true }).first()).toBeVisible();
    await expect(page.getByTitle("View question details").first()).toBeVisible();
    await expectNewWording(page, "the collection page");
    await expectDetailsWording(page, "the collection page");
  });

  test("AC 3.6.48 Flashcards say questions", async ({ page }) => {
    await open(page, `/explore/collections/${COLLECTION_ID}/${SLUG}`);
    await expect(page.getByText("1 of 3", { exact: true })).toBeVisible(FIRST);
    await expect(page.getByText("3 questions", { exact: true })).toBeVisible();
    await expect(page.getByTitle("Previous question")).toBeVisible();
    await expect(page.getByTitle("View question details")).toBeVisible();
    await expect(page.getByText("to create your own questions and collections!")).toBeVisible();
    await expectNewWording(page, "Flashcards");

    await page.getByTitle("Next question").click();
    await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
    await expectNewWording(page, "Flashcards, second card");
    await expectDetailsWording(page, "Flashcards");
  });

  test("AC 3.6.48 a quiz and its results say questions", async ({ page }) => {
    await open(page, `/quiz/collections/${COLLECTION_ID}/${SLUG}`);
    await expect(page.getByText("1 of 3", { exact: true })).toBeVisible(FIRST);
    await expect(page.getByText("3 questions", { exact: true })).toBeVisible();
    await expect(page.getByTitle("View question details")).toBeVisible();
    await expectNewWording(page, "Quiz");

    const answers = page.getByRole("group", { name: "Answer options" });
    for (let n = 1; n <= questions.length; n += 1) {
      await expect(page.getByText(`${n} of 3`, { exact: true })).toBeVisible();
      await answers.getByRole("button").first().click();
      await expectNewWording(page, `Quiz, answered question ${n}`);
      if (n < questions.length) await page.getByRole("button", { name: /^next$/i }).click();
    }
    await page.getByRole("button", { name: /see my score/i }).click();

    await expect(page.getByRole("heading", { name: "Quiz complete" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play a game with these questions" })).toHaveAttribute(
      "href",
      new RegExp(`^/games/collections/${COLLECTION_ID}`),
    );
    await expectNewWording(page, "the quiz results");
  });

  test("AC 3.6.48 Learn on a collection says questions through to the finish screen", async ({ page }) => {
    await open(page, `/learn/collections/${COLLECTION_ID}/${SLUG}`);
    await expect(page.getByRole("progressbar", { name: "Mastered 0 of 3" })).toBeVisible(FIRST);
    await expect(page.getByText("Quiz: one pass. Learn: repeat until mastered. Review: spaced, due questions.")).toBeVisible();
    await expectNewWording(page, "Learn");

    // Every first answer is right, so one round of three masters everything.
    for (let n = 1; n <= questions.length; n += 1) {
      await expect(page.getByText(`Round 1 · ${n} of 3`, { exact: true })).toBeVisible();
      const shown = await page.getByText(/^Which city is the capital of country \d\?$/).textContent();
      const country = /country (\d)/.exec(shown ?? "")?.[1];
      await page.getByRole("group", { name: "Answer options" }).getByRole("button", { name: new RegExp(`City ${country}$`) }).click();
      await expectNewWording(page, `Learn, answered question ${n}`);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }

    await expect(page.getByRole("heading", { name: "You've mastered all 3 questions" })).toBeVisible();
    await expectNewWording(page, "the Learn finish screen");
  });

  test("AC 3.6.48 Learn on a category says questions", async ({ page }) => {
    await open(page, "/learn/geography");
    await expect(page.getByLabel("Questions to learn:")).toBeVisible(FIRST);
    await expect(page.getByRole("progressbar", { name: "Mastered 0 of 3" })).toBeVisible();
    await expectNewWording(page, "Learn on a category");
  });
});
