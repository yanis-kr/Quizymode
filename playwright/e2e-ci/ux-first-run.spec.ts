/**
 * First-visit fixes on phones and laptops (#894, #895, #896, #897). The e2e-ci web build signs in as the DevTest
 * identity, so the signed-out tests serve a copy of that one module which reports no identity: the app then behaves
 * as it does for a visitor. Catalog calls are stubbed where a test needs fixed content.
 */
import { test, expect } from "../fixtures";
import type { Locator, Page, Route } from "@playwright/test";

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

const items = Array.from({ length: 12 }, (_, index) => ({
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

async function stubCatalog(page: Page): Promise<{ rosterUrls: string[] }> {
  const rosterUrls: string[] = [];
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/api/categories")) {
      return json({ categories: [{ category: "geography", count: 885, description: "Countries and capitals", averageRating: null }] });
    }
    if (url.pathname.endsWith("/api/games/roster")) {
      rosterUrls.push(url.search);
      return json({ items, scopes: [{ scope: "", available: items.length, returned: items.length, status: "ok" }] });
    }
    if (url.pathname.endsWith("/api/items")) {
      return json({ items, totalCount: items.length, page: 1, pageSize: items.length, totalPages: 1 });
    }
    if (url.pathname.endsWith("/api/featured")) return json({ sets: [], collections: [] });
    if (url.pathname.endsWith("/api/search")) {
      const empty = { results: [], hasMore: false };
      return json({ query: "capital", groups: { categories: empty, subcategories: empty, collections: empty, items: empty, mine: null } });
    }
    if (url.pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (url.pathname.endsWith("/api/keywords/item-tags")) return json({ names: [] });
    // A topic with questions keeps the category on its Sets view; empty topics are not listed (#900).
    if (url.pathname.endsWith("/api/keywords")) {
      return json({ keywords: [{ name: "capitals", itemCount: items.length, averageRating: null, navigationRank: 1, description: null }] });
    }
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
  return { rosterUrls };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Runs in the page: WCAG contrast of an element's text on its background. Canvas turns any CSS colour into sRGB. */
function contrastOf(element: Element): number {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const luminance = (colour: string): number => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3)).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const style = getComputedStyle(element);
  const a = luminance(style.color);
  const b = luminance(style.backgroundColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Runs in the page: the sRGB value of the first gradient colour of an element, and of the theme surface. */
function gradientStartAndSurface(element: Element): { start: number[]; surface: number[] } {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (colour: string): number[] => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  };
  const gradient = getComputedStyle(element).backgroundImage;
  const first = /(?:oklch|oklab|rgba?|hsla?|lab|lch|color)\([^()]*\)/.exec(gradient)?.[0];
  if (!first) throw new Error(`no gradient colour in "${gradient}"`);
  const probe = document.createElement("div");
  probe.className = "bg-surface";
  document.body.appendChild(probe);
  const surface = rgba(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return { start: rgba(first), surface };
}

test.describe("Unknown addresses (#894)", () => {
  test("AC 3.37.4 on a 375 px phone the not-found page fits, shows the primary link first and opens /start", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signOut(page);
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle("Page not found | Quizymode");
    const primary = page.getByRole("link", { name: "Play a 5-question quiz" });
    await expect(primary).toBeInViewport({ ratio: 1 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await primary.click();
    await expect(page).toHaveURL(/\/start$/);
  });
});

test.describe("Games without chosen topics (#895)", () => {
  test("AC 3.20.35 a signed-out visitor sees the games at once, from all topics, on a 375x812 phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signOut(page);
    const { rosterUrls } = await stubCatalog(page);
    await page.goto("/games");
    const play = page.getByRole("link", { name: "Play Match Race" });
    await expect(play).toBeInViewport({ ratio: 1 });
    const bar = page.getByRole("region", { name: "Game topics" });
    await expect(bar.getByText("All topics", { exact: true })).toBeVisible();
    await expect(bar.getByRole("button")).toHaveText(["Change topics"]);
    await expect(bar.getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(rosterUrls.length).toBeGreaterThan(0);
    for (const search of rosterUrls) expect(new URLSearchParams(search).getAll("scope")).toEqual([]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("Category pages (#896)", () => {
  test("AC 3.5.21 on the dark theme at 375 px the tab cues fade from the surface colour", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signOut(page);
    await stubCatalog(page);

    await page.goto("/categories/geography");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const header = page.getByTestId("scope-landing-header");
    await expect(header.getByRole("link", { name: "Play 5" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Flashcards" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Games" })).toHaveCount(0);
    const modeCue = page.getByTestId("mode-switcher-edge-cue");
    await expect(modeCue).toBeVisible();
    const mode = await modeCue.evaluate(gradientStartAndSurface);
    expect(mode.start).toEqual(mode.surface);
    expect(mode.surface.slice(0, 3)).not.toEqual([255, 255, 255]);
    await page.screenshot({ path: test.info().outputPath("category-dark-375.png") });

    await page.goto("/search?q=capital");
    const searchCue = page.getByTestId("search-tabs-edge-cue");
    await expect(searchCue).toBeVisible();
    const search = await searchCue.evaluate(gradientStartAndSurface);
    expect(search.start).toEqual(search.surface);
    expect(search.surface.slice(0, 3)).not.toEqual([255, 255, 255]);
    await page.screenshot({ path: test.info().outputPath("search-dark-375.png") });
  });
});

test.describe("Quiz page (#897)", () => {
  test("AC 3.18.13 the Options button text keeps 4.5:1 contrast with the dark and the light colours, closed and open", async ({ page }) => {
    await signOut(page);
    await stubCatalog(page);
    await page.goto("/quiz/geography?size=5");
    const options = page.getByRole("button", { name: "Options" });
    await expect(options).toBeVisible();
    // Signed-out visitors always get the dark theme; the light colours are applied to the page for the second pass.
    for (const theme of ["dark", "light"]) {
      await page.evaluate((name) => document.documentElement.setAttribute("data-theme", name), theme);
      for (const expanded of ["false", "true"]) {
        if ((await options.getAttribute("aria-expanded")) !== expanded) await options.click();
        await page.mouse.move(0, 0);
        await expect(options).toHaveAttribute("aria-expanded", expanded);
        expect(await options.evaluate(contrastOf), `${theme}, aria-expanded=${expanded}`).toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: test.info().outputPath(`options-${theme}-${expanded}.png`) });
      }
    }
  });

  test("AC 3.18.12 at 390x660 a signed-out visitor sees the question and two answers without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 660 });
    await signOut(page);
    await stubCatalog(page);
    await page.goto("/quiz/geography?size=5");
    await expect(page.getByRole("button", { name: "Options" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/^Which city is the capital of country \d+\?$/)).toBeInViewport({ ratio: 1 });
    const answers = page.getByRole("group", { name: "Answer options" }).getByRole("button");
    await expect(answers.nth(0)).toBeInViewport({ ratio: 1 });
    await expect(answers.nth(1)).toBeInViewport({ ratio: 1 });
    await expect(page.getByTitle("Previous question")).toHaveCount(0);
    await expect(page.getByTitle("Next question")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("AC 3.6.5a on a laptop screen the signed-in quiz stripe, answers, score and buttons need no scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await stubCatalog(page);
    await page.goto("/quiz/geography?size=5");
    await expect(page.getByLabel("Quiz size:")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTitle("Previous question")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTitle("Next question")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTitle("View question details")).toBeInViewport({ ratio: 1 });
    // One compact stripe: the quiz size, the counter and the details icon sit on the same line.
    const middle = async (locator: Locator): Promise<number> => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height / 2;
    };
    const counter = await middle(page.getByText(/^1 of \d+$/));
    expect(Math.abs((await middle(page.getByLabel("Quiz size:"))) - counter)).toBeLessThanOrEqual(12);
    expect(Math.abs((await middle(page.getByTitle("View question details"))) - counter)).toBeLessThanOrEqual(12);
    await expect(page.getByRole("group", { name: "Answer options" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByText(/^Score: 0 \/ 0 correct/)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
