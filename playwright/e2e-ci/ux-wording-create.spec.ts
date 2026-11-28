/**
 * Create, My collections and Feedback say questions and topics (#924). The e2e-ci web build signs in as the DevTest
 * identity, a regular user. Every API call is stubbed with data that contains none of the checked words, so any match
 * comes from the app's own wording.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const OLD_WORDS = /\b(item|items|sets)\b/i;
/** The content rules text is excluded from this check (it belongs to the legal notice, #901). */
const EXCLUDED_TEXT = /If you later put items into a public collection/;

const USER_ID = "00000000-0000-4000-8000-000000000924";
const COLLECTION_ID = "00000000-0000-4000-8000-000000000925";
const CREATED_AT = "2026-01-01T00:00:00Z";

const user = { id: USER_ID, name: "CI User", email: null, isAdmin: false, createdAt: CREATED_AT, lastLogin: CREATED_AT };

const collection = {
  id: COLLECTION_ID,
  name: "Capital Clues",
  description: "Cities from short clues.",
  createdBy: USER_ID,
  createdAt: CREATED_AT,
  itemCount: 1,
  isPublic: false,
};

const taxonomy = {
  categories: [
    {
      slug: "science",
      name: "Science",
      description: null,
      itemCount: 1,
      groups: [{ slug: "biology", description: null, itemCount: 1, keywords: [{ slug: "plants", description: null, itemCount: 1 }] }],
      allKeywordSlugs: ["biology", "plants"],
    },
  ],
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/users/me") return json(user);
    if (pathname === "/api/users/settings") return json({ settings: { ActiveCollectionId: COLLECTION_ID } });
    if (pathname === "/api/collections") return json({ collections: [collection] });
    if (pathname === "/api/taxonomy/suggest") return json({ suggestions: [] });
    if (pathname === "/api/taxonomy") return json(taxonomy);
    if (pathname === "/api/keywords/item-tags") return json({ names: [] });
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
  const offending = (await page.evaluate(readWording)).filter((text) => OLD_WORDS.test(text) && !EXCLUDED_TEXT.test(text));
  expect(offending, `old wording on ${screen}`).toEqual([]);
}

async function open(page: Page, url: string): Promise<void> {
  await stubApi(page);
  await page.goto(url);
}

/** The first content of a route may wait for the dev server to compile its modules. */
const FIRST = { timeout: 20_000 };

test.describe("Create and feedback wording (#924)", () => {
  test.use({ navigationTimeout: 20_000, actionTimeout: 10_000 });
  test.describe.configure({ timeout: 45_000 });

  test("AC 2.2.8 the Create hub says questions and topics", async ({ page }) => {
    await open(page, "/create");
    await expect(page.getByRole("heading", { level: 1, name: "Create" })).toBeVisible(FIRST);
    await expectNewWording(page, "/create");
  });

  test("AC 2.2.8 Write a question says questions and topics", async ({ page }) => {
    await open(page, "/create/question");
    await expect(page.getByRole("heading", { level: 1, name: "Write a question" })).toBeVisible(FIRST);
    await expect(page.getByText("New questions will be added to your active collection")).toBeVisible();
    await page.getByRole("button", { name: "More options" }).click();
    await expectNewWording(page, "/create/question");
  });

  test("AC 2.2.8 Import questions says questions and topics", async ({ page }) => {
    await open(page, "/create/import");
    await expect(page.getByRole("heading", { level: 1, name: "Import questions" })).toBeVisible(FIRST);
    await expectNewWording(page, "/create/import");
  });

  test("AC 2.2.8 My collections says questions and topics", async ({ page }) => {
    await open(page, "/collections");
    await expect(page.getByText(collection.name).first()).toBeVisible(FIRST);
    await expectNewWording(page, "/collections");
  });

  test("AC 2.2.8 Feedback and its request form say questions and topics", async ({ page }) => {
    await open(page, "/feedback");
    const request = page.getByRole("heading", { name: "Ask for more questions" });
    await expect(request).toBeVisible(FIRST);
    await expectNewWording(page, "/feedback");

    await page.getByRole("button", { name: "Open Ask for more questions" }).click();
    await expect(page.getByRole("dialog").getByText("What questions should we add?")).toBeVisible();
    await expectNewWording(page, "the feedback dialog");
  });
});
