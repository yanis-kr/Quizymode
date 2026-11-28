/**
 * Writing a question on a phone (#901). The e2e-ci web build signs in as the DevTest identity, a regular user. Every
 * API call is stubbed, including the user (not an admin), the user settings (content notice not dismissed, an active
 * collection) and that private collection, so the page does not depend on stored data and nothing is written.
 */
import { test, expect } from "../fixtures";
import type { Locator, Page, Route } from "@playwright/test";

// The first load of a page compiles it on the dev server, which takes longer than the 3 s action default.
test.use({ navigationTimeout: 20_000, actionTimeout: 10_000 });
test.describe.configure({ timeout: 45_000 });

const USER_ID = "00000000-0000-4000-8000-000000000901";
const COLLECTION_ID = "00000000-0000-4000-8000-000000000902";
const ITEM_ID = "00000000-0000-4000-8000-000000000903";
const CREATED_AT = "2026-01-01T00:00:00Z";
const NOTICE_LINE = "Before you add content: only add material you have the right to use.";

const user = { id: USER_ID, name: "CI User", email: null, isAdmin: false, createdAt: CREATED_AT, lastLogin: CREATED_AT };

const collection = {
  id: COLLECTION_ID,
  name: "My Collection",
  description: null,
  createdBy: USER_ID,
  createdAt: CREATED_AT,
  itemCount: 0,
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

const item = {
  id: ITEM_ID,
  category: "science",
  isPrivate: true,
  question: "Which gas do plants take in?",
  correctAnswer: "Carbon dioxide",
  incorrectAnswers: ["Oxygen", "Helium", "Neon"],
  explanation: "",
  createdAt: CREATED_AT,
  createdBy: USER_ID,
  keywords: [],
  collections: [],
  navigationBreadcrumb: ["biology", "plants"],
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
    if (pathname === `/api/items/${ITEM_ID}`) return json(item);
    if (pathname === "/api/keywords/item-tags") return json({ names: [] });
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

interface ActionLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  rowWidth: number;
  labelLines: number;
  overflow: number;
}

/** Runs in the page: where the button sits, how wide its row is and on how many lines its label is drawn. */
function measureAction(button: Locator): Promise<ActionLayout> {
  return button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rowWidth: element.parentElement!.getBoundingClientRect().width,
      labelLines: new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size,
      overflow: element.scrollWidth - element.clientWidth,
    };
  });
}

async function expectStacked(page: Page, names: string[]): Promise<void> {
  const layouts: ActionLayout[] = [];
  for (const name of names) layouts.push(await measureAction(page.getByRole("button", { name, exact: true })));

  layouts.forEach((layout, index) => {
    const label = `${names[index]} at ${page.viewportSize()?.width} px`;
    expect(Math.abs(layout.width - layout.rowWidth), `${label} is full width`).toBeLessThanOrEqual(1);
    expect(layout.height, `${label} is at least 44 px tall`).toBeGreaterThanOrEqual(44);
    expect(layout.labelLines, `${label} keeps its label on one line`).toBe(1);
    expect(layout.overflow, `${label} holds its label`).toBeLessThanOrEqual(0);
    if (index > 0) {
      const previous = layouts[index - 1];
      expect(layout.y, `${label} is below ${names[index - 1]}`).toBeGreaterThanOrEqual(previous.y + previous.height);
    }
  });
}

async function expectInARow(page: Page, names: string[]): Promise<void> {
  const layouts: ActionLayout[] = [];
  for (const name of names) layouts.push(await measureAction(page.getByRole("button", { name, exact: true })));

  layouts.forEach((layout, index) => {
    const label = `${names[index]} at ${page.viewportSize()?.width} px`;
    expect(layout.width, `${label} is not full width`).toBeLessThan(layout.rowWidth);
    expect(layout.labelLines, `${label} keeps its label on one line`).toBe(1);
    if (index > 0) {
      const previous = layouts[index - 1];
      expect(Math.abs(layout.y - previous.y), `${label} is level with ${names[index - 1]}`).toBeLessThanOrEqual(1);
      expect(layout.x, `${label} is right of ${names[index - 1]}`).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
  });
}

async function checkActions(page: Page, names: string[]): Promise<void> {
  for (const width of [375, 639]) {
    await page.setViewportSize({ width, height: 812 });
    await expectStacked(page, names);
  }
  await page.setViewportSize({ width: 640, height: 812 });
  await expectInARow(page, names);
}

test("AC 2.1.25 at 375x812 the whole Question field is on the first screen with the content notice and active collection", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await page.goto("/create/question");

  await expect(page.getByRole("heading", { level: 1, name: "Write a question" })).toBeVisible({ timeout: 20_000 });
  // Both banners above the form must be on the page before the position of the field means anything.
  await expect(page.getByText(NOTICE_LINE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read the content rules" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("New questions will be added to your active collection")).toBeVisible();
  await expect(page.getByRole("link", { name: collection.name, exact: true })).toBeVisible();
  await expect(page.getByText("Private: it is not listed in public categories or search.", { exact: true })).toBeAttached();

  const question = page.getByLabel("Question *", { exact: true });
  await expect(question).toBeInViewport({ ratio: 1 });
  const box = await question.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("create-question-375.png") });
});

test("AC 2.1.24 the create actions stack full width below 640 px and sit in a row from 640 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await page.goto("/create/question");
  await expect(page.getByRole("button", { name: "Save and study", exact: true })).toBeVisible({ timeout: 20_000 });

  await checkActions(page, ["Cancel", "Save and add another", "Save and study"]);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Cancel", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("create-actions-375.png"), fullPage: true });
});

test("AC 2.1.24 the edit actions Cancel and Save stack full width below 640 px and sit in a row from 640 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await page.goto(`/items/${ITEM_ID}/edit`);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible({ timeout: 20_000 });

  await checkActions(page, ["Cancel", "Save"]);
});

/** Opens the form with its topic chosen, fills the required fields and records every create request. */
async function openFilledForm(page: Page): Promise<string[]> {
  await stubApi(page);
  const created: string[] = [];
  await page.route("**/api/items", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    created.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(item) });
  });
  await page.goto("/create/question?category=science&keywords=biology,plants");
  await expect(page.getByRole("heading", { level: 1, name: "Write a question" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("topic-pill")).toBeVisible();
  await expect(page.getByRole("link", { name: collection.name, exact: true })).toBeVisible();
  await page.getByLabel("Question *", { exact: true }).fill(item.question);
  await page.getByLabel("Correct Answer *", { exact: true }).fill(item.correctAnswer);
  await page.getByLabel("Incorrect answer 1", { exact: true }).fill(item.incorrectAnswers[0]);
  return created;
}

test("AC 2.1.29 Enter in a single-line field saves once and opens the question like Save and study", async ({ page }) => {
  const created = await openFilledForm(page);

  await page.getByLabel("Correct Answer *", { exact: true }).press("Enter");

  await expect(page).toHaveURL(new RegExp(`/explore/collections/${COLLECTION_ID}/item/${ITEM_ID}`));
  expect(created).toHaveLength(1);
});

test("AC 2.1.32 the create actions keep their order and Save and add another saves and clears the form", async ({ page }) => {
  const created = await openFilledForm(page);
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  const another = page.getByRole("button", { name: "Save and add another", exact: true });
  const study = page.getByRole("button", { name: "Save and study", exact: true });

  const boxes = await Promise.all([cancel, another, study].map((button) => button.boundingBox()));
  expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x);
  expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x);
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(another).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(study).toBeFocused();

  await another.click();

  await expect(page.getByText("Saved. Add the next question.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Question *", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/create\/question/);
  expect(created).toHaveLength(1);
});
