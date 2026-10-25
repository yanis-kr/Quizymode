/**
 * Global search E2E tests, AC 11 (header search and the /search page, #321).
 *
 * GET /search is mocked with page.route, so these run against any frontend (local Vite, preview, production)
 * without needing seeded data. Signed-in behavior (the Mine group and tab) is covered by the Vitest suites:
 * the Cognito session cannot be faked from here.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page, Request, Route } from "@playwright/test";
import { expect, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

const COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
const ITEM_ID = "5a1d2c3e-1111-4222-8333-444455556666";

interface SearchGroups {
  categories: unknown;
  subcategories: unknown;
  collections: unknown;
  items: unknown;
  mine: unknown;
}

const EMPTY_GROUPS: SearchGroups = {
  categories: { results: [], hasMore: false },
  subcategories: { results: [], hasMore: false },
  collections: { results: [], hasMore: false },
  items: { results: [], hasMore: false },
  mine: null,
};

const AI_RESPONSE = {
  query: "artificial intelligence",
  groups: {
    categories: { results: [], hasMore: false },
    subcategories: {
      results: [{ categorySlug: "tech", l1: "ai-ml", l2: null, description: "AI and ML", itemCount: 57 }],
      hasMore: true,
    },
    collections: {
      results: [{ id: COLLECTION_ID, name: "Intro to AI", description: "Basics of artificial intelligence", itemCount: 30 }],
      hasMore: true,
    },
    items: {
      results: [
        {
          id: ITEM_ID,
          snippet: { text: "What is artificial intelligence?", highlights: [{ start: 8, length: 10 }] },
          categorySlug: "tech",
          l1: "ai-ml",
          l2: "llms",
        },
      ],
      hasMore: false,
    },
    mine: null,
  },
};

const EMPTY_RESPONSE = { query: "zzzz", groups: EMPTY_GROUPS };

type Responder = (request: Request) => { status?: number; headers?: Record<string, string>; body: unknown };

/** Mocks GET /search (fetch/xhr only, so the SPA /search document request is left alone) and records the requests. */
async function mockSearch(page: Page, responder: Responder = () => ({ body: AI_RESPONSE })): Promise<Request[]> {
  const requests: Request[] = [];
  await page.route(/\/search\?/, async (route: Route) => {
    const request = route.request();
    if (request.resourceType() !== "fetch" && request.resourceType() !== "xhr") {
      await route.continue();
      return;
    }

    requests.push(request);
    const { status = 200, headers = {}, body } = responder(request);
    await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

/** Captures page-view and analytics POST bodies so a test can assert on what leaves the browser. */
async function captureAnalytics(page: Page): Promise<{ pageViews: string[]; events: string[] }> {
  const captured = { pageViews: [] as string[], events: [] as string[] };
  await page.route(/\/analytics\/(page-views|events)/, async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      (request.url().includes("page-views") ? captured.pageViews : captured.events).push(request.postData() ?? "");
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
  });
  return captured;
}

function headerBox(page: Page) {
  return page.getByRole("combobox", { name: "Search Quizymode" });
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function expectNoAxeViolations(page: Page, include: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(include)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** True when every nav link's text sits on one line (a wrapped link has more than one client rect row). */
async function expectNavLinksOnOneLine(page: Page): Promise<void> {
  const lineCounts = await page.evaluate(() =>
    ["Categories", "Featured", "Collections"].map((name) => {
      const link = Array.from(document.querySelectorAll("nav a")).find((a) => a.textContent?.trim() === name);
      if (!link) return -1;
      const range = document.createRange();
      range.selectNodeContents(link);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    })
  );
  expect(lineCounts).toEqual([1, 1, 1]);
}

async function typeSlowly(page: Page, text: string): Promise<void> {
  await headerBox(page).click();
  await headerBox(page).pressSequentially(text, { delay: 25 });
}

test.describe("header search", () => {
  test("AC 11.15 - P1/P2 the header fits at 1280 (inline, 224 px) and 1024 (icon only)", async ({ page }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(headerBox(page)).toBeVisible();

    const box = await headerBox(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(223);
    expect(box?.width).toBeLessThanOrEqual(225);
    await expect(page.getByRole("button", { name: "Search" })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await expectNavLinksOnOneLine(page);

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(headerBox(page)).toHaveCount(0);
    const trigger = page.getByRole("button", { name: "Search" });
    await expect(trigger).toBeVisible();
    await expectNoHorizontalScroll(page);

    const triggerBox = await trigger.boundingBox();
    const signIn = await page.getByRole("link", { name: "Sign In" }).first().boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(signIn).not.toBeNull();
    expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(signIn!.x);
    await expectNavLinksOnOneLine(page);
  });

  test("AC 11.16 - P4 at 375 px the icon opens a full-screen overlay with a focused 16px input", async ({ page }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await page.getByRole("button", { name: "Search" }).click();

    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await expect(headerBox(page)).toBeFocused();
    const fontSize = await headerBox(page).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox?.width).toBe(375);
    await expectNoHorizontalScroll(page);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search" })).toBeFocused();
  });

  test("AC 11.17 - P5 Ctrl+K works from the page and from inputs, slash only from the page, neither over a dialog", async ({
    page,
  }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/search?q=a");
    await expect(headerBox(page)).toBeVisible();

    await page.keyboard.press("Control+K");
    await expect(headerBox(page)).toBeFocused();

    const pageInput = page.getByRole("search", { name: "Search Quizymode" }).getByRole("textbox");
    await pageInput.click();
    await page.keyboard.press("Control+K");
    await expect(headerBox(page)).toBeFocused();

    await pageInput.click();
    await page.keyboard.press("/");
    await expect(pageInput).toBeFocused();
    await expect(pageInput).toHaveValue("a/");

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("/");
    await expect(headerBox(page)).toBeFocused();

    // A mounted dialog (the footer Feedback dialog) owns the keyboard: neither shortcut moves focus.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.getByRole("button", { name: "Feedback" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Control+K");
    await page.keyboard.press("/");
    await expect(headerBox(page)).not.toBeFocused();
  });

  test(
    "AC 11.18 @smoke - P6 typing Artificial Intelligence shows tech > ai-ml under Topics with one request, Enter opens it",
    async ({ page }) => {
      const requests = await mockSearch(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      await typeSlowly(page, "Artificial Intelligence");

      const topics = page.getByRole("group", { name: "Topics" });
      await expect(topics).toContainText("tech");
      await expect(topics).toContainText("ai-ml");
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url());
      expect(url.searchParams.get("q")).toBe("Artificial Intelligence");
      expect(url.searchParams.get("limit")).toBe("5");
      expect(url.searchParams.get("types")).not.toContain("mine");

      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/categories\/tech\/ai-ml$/);
    }
  );

  test("AC 11.19 - P7 arrow keys wrap and skip headings, Escape twice clears, Tab closes", async ({ page }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await typeSlowly(page, "artificial");

    const options = page.getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    const count = await options.count();

    await page.keyboard.press("ArrowUp");
    await expect(options.nth(count - 1)).toHaveAttribute("aria-selected", "true");
    await expect(options.nth(count - 1)).toContainText("See all results for");
    await page.keyboard.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(headerBox(page)).toHaveValue("artificial");
    await page.keyboard.press("Escape");
    await expect(headerBox(page)).toHaveValue("");

    await headerBox(page).pressSequentially("artificial", { delay: 25 });
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("AC 11.20 - P9 the open dropdown has the combobox ARIA wiring and no axe violations", async ({ page }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await typeSlowly(page, "artificial");

    const input = headerBox(page);
    await expect(page.getByRole("listbox", { name: "Search results" })).toBeVisible();
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveAttribute("aria-controls", "global-search-listbox");
    const active = await input.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");

    await expectNoAxeViolations(page, '[role="search"]');
  });

  test("AC 11.21 - P10 empty, server error and 429 states", async ({ page }) => {
    let mode: "empty" | "error" | "limit" | "ok" = "empty";
    const requests = await mockSearch(page, () => {
      switch (mode) {
        case "empty":
          return { body: EMPTY_RESPONSE };
        case "error":
          return { status: 500, body: { title: "boom" } };
        case "limit":
          return { status: 429, headers: { "Retry-After": "3" }, body: { detail: "Too many searches." } };
        default:
          return { body: AI_RESPONSE };
      }
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // Empty: copy outside any listbox, axe clean, Enter still goes to /search.
    await typeSlowly(page, "zzzz");
    await expect(page.getByText("No results for “zzzz”")).toBeVisible();
    await expect(page.getByText("Check the spelling or try fewer words.")).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(headerBox(page)).toHaveAttribute("aria-expanded", "false");
    await expectNoAxeViolations(page, '[role="search"]');

    // 500: message plus a Try again option the keyboard can reach.
    mode = "error";
    await headerBox(page).fill("");
    await headerBox(page).pressSequentially("broken", { delay: 25 });
    await expect(page.getByText("Could not load search results.").first()).toBeVisible();
    await expectNoAxeViolations(page, '[role="search"]');
    const beforeRetry = requests.length;
    mode = "ok";
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Topics" })).toBeVisible();
    expect(requests.length).toBe(beforeRetry + 1);

    // 429: static notice with the Retry-After seconds, no request until the button is used.
    mode = "limit";
    await headerBox(page).fill("");
    await headerBox(page).pressSequentially("limited", { delay: 25 });
    await expect(page.getByText("You are searching too fast. Try again in 3 seconds.")).toBeVisible();
    await expectNoAxeViolations(page, '[role="search"]');
    const afterLimit = requests.length;
    await page.waitForTimeout(1_000);
    expect(requests.length).toBe(afterLimit);
    mode = "ok";
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("group", { name: "Topics" })).toBeVisible();
    expect(requests.length).toBe(afterLimit + 1);
  });

  test("AC 11.22 - P12 anonymous visitors never ask for Mine and get no Mine tab", async ({ page }) => {
    const requests = await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/search?q=artificial&tab=mine");

    await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Mine" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Topics" })).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(new URL(request.url()).searchParams.get("types")).not.toContain("mine");
    }
  });
});

test.describe("search page", () => {
  test("AC 11.23 - P15 tabs use a roving tabindex, update the URL, pass axe, and fit 375 px", async ({ page }) => {
    await mockSearch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/search?q=artificial");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("tab", { name: "Topics" })).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("heading", { level: 2, name: "Topics" })).toBeVisible();
    await expectNoAxeViolations(page, "main");

    for (const [name, tab] of [
      ["Topics", "topics"],
      ["Collections", "collections"],
      ["Questions", "questions"],
    ] as const) {
      await page.getByRole("tab", { name }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("navigation", { name: "Search results pages" })).toBeVisible();
      await expectNoAxeViolations(page, "main");
    }

    await page.getByRole("tab", { name: "Questions" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "All" })).toBeFocused();
    await expect(page).not.toHaveURL(/tab=/);

    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoHorizontalScroll(page);
  });

  test("AC 11.24 - P17 page views carry no search text and one search_performed fires per committed search", async ({
    page,
  }) => {
    await mockSearch(page);
    const analytics = await captureAnalytics(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/search?q=secretphrase");
    await expect(page.getByRole("heading", { level: 2, name: "Topics" })).toBeVisible();

    await expect.poll(() => analytics.pageViews.length).toBeGreaterThan(0);
    await expect.poll(() => analytics.events.filter((body) => body.includes("search_performed")).length).toBe(1);

    // Tab switches are not new searches.
    await page.getByRole("tab", { name: "Topics" }).click();
    await expect(page.getByRole("navigation", { name: "Search results pages" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(analytics.events.filter((body) => body.includes("search_performed"))).toHaveLength(1);

    for (const body of [...analytics.pageViews, ...analytics.events]) {
      expect(body).not.toContain("secretphrase");
    }
    expect(analytics.pageViews.some((body) => body.includes('"path":"/search"'))).toBe(true);
    expect(analytics.pageViews.every((body) => !body.includes("queryString\":\"?"))).toBe(true);
  });

  test("AC 11.25 - P18 every result type links to its route", async ({ page }) => {
    await mockSearch(page, () => ({
      body: {
        query: "ai",
        groups: {
          categories: {
            results: [{ slug: "tech", name: "tech", description: "Technology", itemCount: 12 }],
            hasMore: false,
          },
          subcategories: {
            results: [
              { categorySlug: "tech", l1: "ai-ml", l2: null, description: "AI and ML", itemCount: 57 },
              { categorySlug: "tech", l1: "ai-ml", l2: "llms", description: "Large language models", itemCount: 9 },
            ],
            hasMore: false,
          },
          collections: AI_RESPONSE.groups.collections,
          items: AI_RESPONSE.groups.items,
          mine: null,
        },
      },
    }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/search?q=ai");
    await expect(page.getByRole("heading", { level: 2, name: "Topics" })).toBeVisible();

    const hrefs = await page.getByRole("tabpanel").getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href"))
    );
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/categories/tech",
        "/categories/tech/ai-ml",
        "/categories/tech/ai-ml/llms",
        `/collections/${COLLECTION_ID}/intro+to+ai`,
        `/items/${ITEM_ID}`,
      ])
    );
  });
});
