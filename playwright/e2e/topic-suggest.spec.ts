/**
 * Topic suggestion chips and the searchable topic picker E2E tests, AC 12 (#323).
 *
 * Every API call is mocked with page.route (the taxonomy, POST /taxonomy/suggest, the saves and analytics), so these run
 * against any frontend (local Vite, preview, production) without seeded data and never reach the real API or load the
 * topic profiles. The Cognito session is faked in localStorage (Amplify only decodes the tokens, it does not verify
 * them), which is enough for the signed-in create pages. Sign-out purging is covered by the Vitest suites.
 *
 * Set TOPIC_SUGGEST_SCREENSHOT_DIR to also write screenshots of the create-question states.
 */
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page, Request, Route } from "@playwright/test";
import { expect, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

interface Suggestion {
  categorySlug: string;
  l1: string;
  l2: string;
  path: string;
  description: string;
  score: number;
  matchedTerms: string[];
  reason: "text" | "yours" | "popular";
}

interface Taxonomy {
  categories: Array<{ slug: string; groups: Array<{ slug: string; keywords: Array<{ slug: string }> }> }>;
}

const WEB_ROOT = path.resolve(process.cwd(), "src/Quizymode.Web");
const TAXONOMY: Taxonomy = JSON.parse(
  fs.readFileSync(path.join(WEB_ROOT, "src/features/topics/__fixtures__/taxonomy.fixture.json"), "utf8")
);

function readCognitoClientId(): string {
  if (process.env.PLAYWRIGHT_COGNITO_CLIENT_ID) return process.env.PLAYWRIGHT_COGNITO_CLIENT_ID;
  const env = fs.readFileSync(path.join(WEB_ROOT, ".env.production"), "utf8");
  const match = env.match(/VITE_COGNITO_CLIENT_ID=(\S+)/);
  if (!match) throw new Error("Set PLAYWRIGHT_COGNITO_CLIENT_ID: the Cognito client id of the frontend under test.");
  return match[1];
}

function suggestion(
  categorySlug: string,
  l1: string,
  l2: string,
  reason: Suggestion["reason"] = "text",
  description = ""
): Suggestion {
  return {
    categorySlug,
    l1,
    l2,
    path: `${categorySlug} › ${l1} › ${l2}`,
    description,
    score: reason === "text" ? 0.6 : 0,
    matchedTerms: [],
    reason,
  };
}

const TEXT_CHIPS: Suggestion[] = [
  suggestion("tech", "ai-ml", "deep-learning", "text", "Neural nets"),
  suggestion("tech", "ai-ml", "nlp", "text", "Language"),
  suggestion("exams", "aws", "saa-c03", "text", "Arch associate"),
];

const FALLBACK_CHIPS: Suggestion[] = [
  suggestion("tech", "ai-ml", "deep-learning", "yours", "Neural nets"),
  suggestion("exams", "aws", "saa-c03", "popular", "Arch associate"),
];

const QUESTION = "How do neural networks learn weights with backpropagation?";
const ANSWER = "By following gradients of the loss";

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url(payload)}.signature`;
}

/** Puts a fake, unexpired Cognito session in localStorage before any page script runs. */
async function signIn(page: Page, options: { admin?: boolean } = {}): Promise<void> {
  const clientId = readCognitoClientId();
  const username = "e2e-topic-user";
  const now = Math.floor(Date.now() / 1000);
  const common = {
    sub: "e2e-topic-subject",
    "cognito:username": username,
    iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_e2e",
    iat: now,
    exp: now + 3 * 60 * 60,
    ...(options.admin ? { "cognito:groups": ["admin"] } : {}),
  };
  const accessToken = fakeJwt({ ...common, token_use: "access", client_id: clientId, scope: "aws.cognito.signin.user.admin" });
  const idToken = fakeJwt({ ...common, token_use: "id", aud: clientId, email: "e2e-topic@example.test", email_verified: true });

  await page.addInitScript(
    (args: { clientId: string; username: string; accessToken: string; idToken: string }) => {
      const prefix = `CognitoIdentityServiceProvider.${args.clientId}`;
      window.localStorage.setItem(`${prefix}.LastAuthUser`, args.username);
      window.localStorage.setItem(`${prefix}.${args.username}.accessToken`, args.accessToken);
      window.localStorage.setItem(`${prefix}.${args.username}.idToken`, args.idToken);
      window.localStorage.setItem(`${prefix}.${args.username}.refreshToken`, "fake-refresh-token");
      window.localStorage.setItem(`${prefix}.${args.username}.clockDrift`, "0");
    },
    { clientId, username, accessToken, idToken }
  );
}

type SuggestResponder = (request: Request, body: { text?: string; limit?: number }) => {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

interface MockedApi {
  suggestBodies: Array<{ text?: string; limit?: number }>;
  saved: Array<Record<string, unknown>>;
  uploads: Array<Record<string, unknown>>;
  documents: string[];
  events: Array<{ name: string; contextType?: string; contextId?: string; position?: number; total?: number; runId?: string }>;
  rawAnalytics: string[];
}

const textOrFallback: SuggestResponder = (_request, body) => ({
  body: { suggestions: body.text && body.text.trim().length > 0 ? TEXT_CHIPS : FALLBACK_CHIPS },
});

/** Harmless empty shapes for the calls these flows do not care about (settings, lists), so no page crashes on {}. */
const GENERIC_BODY = JSON.stringify({ settings: {}, categories: [], items: [], collections: [], policies: [] });

const STORED_ITEM = {
  id: "e2e-item-1",
  category: "tech",
  isPrivate: true,
  question: QUESTION,
  correctAnswer: ANSWER,
  incorrectAnswers: ["a", "b", "c"],
  explanation: "",
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "e2e-internal-user",
  keywords: [],
  collections: [],
  navigationBreadcrumb: ["ai-ml", "nlp"],
  source: null,
  readyForReview: false,
};

function isApiCall(request: Request): boolean {
  return request.resourceType() === "fetch" || request.resourceType() === "xhr";
}

/**
 * Mocks every API call. A catch-all answers anything unlisted with an empty object, then the specific routes (registered
 * later, so they win) answer the ones these flows use.
 */
async function mockApi(page: Page, suggest: SuggestResponder = textOrFallback): Promise<MockedApi> {
  const api: MockedApi = { suggestBodies: [], saved: [], uploads: [], documents: [], events: [], rawAnalytics: [] };

  await page.route("**/*", async (route: Route) => {
    if (!isApiCall(route.request())) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: GENERIC_BODY });
  });

  await page.route(/\/taxonomy$/, async (route: Route) => {
    if (!isApiCall(route.request())) return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TAXONOMY_RESPONSE) });
  });

  await page.route(/\/taxonomy\/suggest$/, async (route: Route) => {
    const request = route.request();
    const body = (request.postDataJSON() ?? {}) as { text?: string; limit?: number };
    api.suggestBodies.push(body);
    const { status = 200, headers = {}, body: responseBody = {} } = suggest(request, body);
    await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(responseBody) });
  });

  await page.route(/\/items$/, async (route: Route) => {
    const request = route.request();
    if (!isApiCall(request) || request.method() !== "POST") return route.fallback();
    api.saved.push(request.postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "e2e-item-1" }) });
  });

  await page.route(/\/users\/me$/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "e2e-internal-user" }) });
  });

  // The page a save lands on, and the item the edit page loads.
  await page.route(/\/items\/e2e-item-1$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STORED_ITEM) });
  });

  await page.route(/\/items\/upload-to-collection$/, async (route: Route) => {
    api.uploads.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ collectionId: "e2e-collection-1", name: "Imported", itemCount: 2 }),
    });
  });

  await page.route(/\/study-guides\/documents\/config$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        maxFileBytes: 20 * 1024 * 1024,
        maxPages: 300,
        maxTextBytes: 200_000,
        acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
        freeTierDelayMinutes: 10,
        quota: { tier: "Free", dailyLimit: 10, dailyUsed: 0, monthlyLimit: 60, monthlyUsed: 0, remainingToday: 10 },
      }),
    });
  });

  await page.route(/\/study-guides\/documents$/, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    api.documents.push(request.postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "e2e-doc-1", isDuplicate: false }) });
  });

  await page.route(/\/users\/policy-acceptances\/status$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ needsAcceptance: false, policies: [] }),
    });
  });

  await page.route(/\/analytics\/(page-views|events)/, async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().includes("/analytics/events")) {
      const raw = request.postData() ?? "";
      api.rawAnalytics.push(raw);
      try {
        api.events.push(...(JSON.parse(raw) as { events: MockedApi["events"] }).events);
      } catch {
        // A body that is not JSON is ignored here; the raw text is still checked for leaks.
      }
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
  });

  return api;
}

const TAXONOMY_RESPONSE = {
  categories: TAXONOMY.categories.map((category) => ({
    ...category,
    name: category.slug,
    description: null,
    itemCount: 0,
    allKeywordSlugs: category.groups.flatMap((group) => [group.slug, ...group.keywords.map((k) => k.slug)]),
    groups: category.groups.map((group) => ({
      ...group,
      description: null,
      itemCount: 0,
      keywords: group.keywords.map((k) => ({ ...k, description: null, itemCount: 0 })),
    })),
  })),
};

function topicGroup(page: Page): Locator {
  return page.getByTestId("topic-scope");
}

function chips(page: Page): Locator {
  return page.getByTestId("topic-chip");
}

function searchBox(page: Page): Locator {
  return page.getByRole("combobox", { name: "Search topics" });
}

/** The hidden cascading selects stay mounted, so a chosen path can be read from them. */
async function chosenPath(page: Page, idPrefix: string): Promise<string[]> {
  return [
    await page.locator(`#${idPrefix}-category`).inputValue(),
    await page.locator(`#${idPrefix}-rank1`).inputValue(),
    await page.locator(`#${idPrefix}-rank2`).inputValue(),
  ];
}

async function openBrowseAll(page: Page): Promise<void> {
  const summary = page.getByText("Browse all topics", { exact: true });
  const details = page.locator("details", { has: summary });
  if ((await details.getAttribute("open")) === null) {
    await summary.click();
  }
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

async function fillQuestionForm(page: Page): Promise<void> {
  await page.getByText("Question *").locator("xpath=following-sibling::textarea").first().pressSequentially(QUESTION, { delay: 5 });
  await page.getByText("Correct Answer *").locator("xpath=following-sibling::input").first().fill(ANSWER);
  await page.getByPlaceholder("Incorrect answer 1").fill("By guessing");
}

async function typeQuestion(page: Page): Promise<void> {
  await page.getByText("Question *").locator("xpath=following-sibling::textarea").first().pressSequentially(QUESTION, { delay: 5 });
}

/** Scrolls the topic group to the top of the viewport and captures the viewport. */
async function screenshotTopic(page: Page, file: string): Promise<void> {
  await topicGroup(page).evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  await page.screenshot({ path: file, fullPage: false });
}

function screenshotDir(): string | null {
  const dir = process.env.TOPIC_SUGGEST_SCREENSHOT_DIR;
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test.describe("create question: chips and the picker", () => {
  test("AC 12.10 - chips appear once after a pause, one tap fills the whole topic, the save reports shown and accepted", async ({
    page,
  }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/create/question");

    // The empty-text fallback request on mount shows the common topics before anything is typed.
    await expect(chips(page)).toHaveCount(2);
    await expect(topicGroup(page).getByText("Common topics")).toBeVisible();
    expect(api.suggestBodies).toHaveLength(1);
    expect(api.suggestBodies[0].text ?? "").toBe("");

    await typeQuestion(page);
    await expect(topicGroup(page).getByText("Suggested from your text")).toBeVisible();
    await expect(chips(page)).toHaveCount(3);
    // One request after the pause, not one per keystroke.
    expect(api.suggestBodies).toHaveLength(2);
    expect(api.suggestBodies[1].text).toBe(QUESTION);
    expect(api.suggestBodies[1].limit).toBe(5);

    // Nothing is pre-selected, however much is typed.
    await expect(page.getByTestId("topic-pill")).toHaveCount(0);
    await expect(page.locator("#item-form-category")).toHaveValue("");

    await expectNoAxeViolations(page, "[data-testid=topic-scope]");

    const dir = screenshotDir();
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-chips-1280.png"));

    await chips(page).nth(1).click();
    const pill = page.getByTestId("topic-pill");
    await expect(pill).toContainText("tech");
    await expect(pill).toContainText("nlp");
    await expect(page.getByRole("button", { name: "Remove topic tech, ai-ml, nlp" })).toBeFocused();
    expect(await chosenPath(page, "item-form")).toEqual(["tech", "ai-ml", "nlp"]);
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-pill-1280.png"));

    // Further typing sends no more suggest requests and changes nothing.
    await page.getByText("Correct Answer *").locator("xpath=following-sibling::input").first().fill(ANSWER);
    await page.getByPlaceholder("Incorrect answer 1").fill("By guessing");
    await page.waitForTimeout(900);
    expect(api.suggestBodies).toHaveLength(2);
    expect(await chosenPath(page, "item-form")).toEqual(["tech", "ai-ml", "nlp"]);

    await page.getByRole("button", { name: "Save and study" }).click();
    await expect.poll(() => api.saved.length).toBe(1);
    expect(api.saved[0]).toMatchObject({ category: "tech", navigationKeyword1: "ai-ml", navigationKeyword2: "nlp" });

    await expect.poll(() => api.events.length).toBeGreaterThanOrEqual(2);
    const topicEvents = api.events.filter((event) => event.name.startsWith("topic_suggestion_"));
    expect(topicEvents.map((event) => event.name)).toEqual(["topic_suggestion_shown", "topic_suggestion_accepted"]);
    // "shown" describes the first chips on screen: the common topics shown before anything was typed.
    expect(topicEvents[0]).toMatchObject({ contextType: "topic", contextId: "yours", total: 2 });
    // The saved item is private (the default), so the path is not reported.
    expect(topicEvents[1]).toMatchObject({ contextType: "topic", position: 2 });
    expect(topicEvents[1].contextId).toBeUndefined();
    expect(topicEvents[1].runId).toBe(topicEvents[0].runId);
    // No analytics payload carries the form text.
    const wire = api.rawAnalytics.join("\n");
    expect(wire).not.toContain("backpropagation");
    expect(wire).not.toContain(ANSWER);
  });

  test("AC 12.13 - removing the pill brings the cached chips back without a new request", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/question");
    await typeQuestion(page);
    await expect(chips(page)).toHaveCount(3);
    const requests = api.suggestBodies.length;

    await chips(page).first().click();
    await expect(page.getByTestId("topic-pill")).toBeVisible();
    await page.getByRole("button", { name: /^Remove topic/ }).click();

    await expect(page.getByTestId("topic-pill")).toHaveCount(0);
    await expect(searchBox(page)).toBeFocused();
    await expect(chips(page)).toHaveCount(3);
    expect(api.suggestBodies).toHaveLength(requests);
    expect(await chosenPath(page, "item-form")).toEqual(["", "", ""]);
  });

  test("AC 12.15 - the keyboard picker overrides the chips and the save reports overridden", async ({ page }) => {
    await signIn(page, { admin: true });
    const api = await mockApi(page);
    await page.goto("/create/question");
    await typeQuestion(page);
    await expect(chips(page)).toHaveCount(3);

    await searchBox(page).fill("aws saa");
    await expect(page.getByRole("listbox", { name: "Topics" })).toBeVisible();
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const active = await searchBox(page).getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    const label = ((await page.locator(`[id="${active}"]`).textContent()) ?? "").replace(/\s+/g, " ");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("topic-pill")).toBeVisible();
    const [category, l1, l2] = await chosenPath(page, "item-form");
    expect(label).toContain(l2);

    // A public item (admin) reports the path it used instead of the chips.
    await page.getByRole("checkbox", { name: /private item/i }).uncheck();
    await page.getByText("Correct Answer *").locator("xpath=following-sibling::input").first().fill(ANSWER);
    await page.getByPlaceholder("Incorrect answer 1").fill("By guessing");
    await page.getByRole("button", { name: "Save and study" }).click();

    await expect.poll(() => api.events.filter((event) => event.name.startsWith("topic_suggestion_")).length).toBe(2);
    const events = api.events.filter((event) => event.name.startsWith("topic_suggestion_"));
    const chipPaths = TEXT_CHIPS.map((chip) => `${chip.categorySlug}/${chip.l1}/${chip.l2}`);
    if (chipPaths.includes(`${category}/${l1}/${l2}`)) {
      expect(events[1].name).toBe("topic_suggestion_accepted");
    } else {
      expect(events[1]).toMatchObject({
        name: "topic_suggestion_overridden",
        contextType: "topic",
        contextId: `${category}/${l1}/${l2}`,
      });
    }
  });

  test("AC 12.15 - at 375 px the chips stack, nothing scrolls sideways, the listbox is inline and axe is clean", async ({
    page,
  }) => {
    await signIn(page);
    await mockApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/create/question");
    await typeQuestion(page);
    await expect(chips(page)).toHaveCount(3);
    await expectNoHorizontalScroll(page);

    const groupBox = (await topicGroup(page).boundingBox())!;
    for (let index = 0; index < 3; index += 1) {
      const box = (await chips(page).nth(index).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Full width of the group, stacked one under the other.
      expect(box.width).toBeGreaterThan(groupBox.width * 0.9);
      if (index > 0) {
        const previous = (await chips(page).nth(index - 1).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
      }
    }
    const dir = screenshotDir();
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-chips-375.png"));

    await searchBox(page).fill("saa");
    const listbox = page.getByRole("listbox", { name: "Topics" });
    await expect(listbox).toBeVisible();
    const panelPosition = await listbox.evaluate((element) => getComputedStyle(element.parentElement!).position);
    expect(panelPosition).toBe("static");
    const inputBox = (await searchBox(page).boundingBox())!;
    const listBox = (await listbox.boundingBox())!;
    expect(listBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page, "[data-testid=topic-scope]");
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-picker-375.png"));

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("topic-pill")).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-pill-375.png"));
  });

  test("AC 12.15 - the picker is anchored under the input at 1280 and axe is clean with the list open", async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/create/question");
    await expect(chips(page)).toHaveCount(2);

    await searchBox(page).fill("saa");
    const listbox = page.getByRole("listbox", { name: "Topics" });
    await expect(listbox).toBeVisible();
    const panelPosition = await listbox.evaluate((element) => getComputedStyle(element.parentElement!).position);
    expect(panelPosition).toBe("absolute");
    await expectNoAxeViolations(page, "[data-testid=topic-scope]");
    const dir = screenshotDir();
    if (dir) await screenshotTopic(page, path.join(dir, "create-question-picker-1280.png"));
  });

  test("AC 12.14 - saving without a topic shows the topic message, focuses the search box and axe stays clean", async ({
    page,
  }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/question");
    await expect(chips(page)).toHaveCount(2);
    await fillQuestionForm(page);

    await page.getByRole("button", { name: "Save and study" }).click();

    await expect(topicGroup(page).getByRole("alert")).toHaveText(
      "Choose a topic: pick a suggestion, search, or browse all topics."
    );
    await expect(searchBox(page)).toBeFocused();
    expect(api.saved).toHaveLength(0);
    await expectNoAxeViolations(page, "[data-testid=topic-scope]");
  });

  test("AC 12.13 - Browse all topics uses the cascading selects and ends in the pill", async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto("/create/question");
    await expect(chips(page)).toHaveCount(2);

    await openBrowseAll(page);
    await page.locator("#item-form-category").selectOption("tech");
    await page.locator("#item-form-rank1").selectOption("ai-ml");
    await expectNoAxeViolations(page, "[data-testid=topic-scope]");
    await page.locator("#item-form-rank2").selectOption("nlp");

    await expect(page.getByTestId("topic-pill")).toContainText("nlp");
    await expect(page.getByRole("button", { name: "Remove topic tech, ai-ml, nlp" })).toBeFocused();
  });

  test("AC 12.16 - a 429 or a 500 hides the chips quietly; the picker, Browse and the save still work", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page, () => ({ status: 429, headers: { "Retry-After": "30" }, body: { detail: "slow down" } }));
    await page.goto("/create/question");
    await expect.poll(() => api.suggestBodies.length).toBe(1);

    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Finding topics…")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await searchBox(page).fill("ec2");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("topic-pill")).toBeVisible();
    await fillQuestionForm(page);
    await page.getByRole("button", { name: "Save and study" }).click();
    await expect.poll(() => api.saved.length).toBe(1);
    // No chip was ever shown, so nothing is reported.
    expect(api.events.filter((event) => event.name.startsWith("topic_suggestion_"))).toEqual([]);

    const failing = await page.context().newPage();
    await signIn(failing);
    const failingApi = await mockApi(failing, () => ({ status: 500, body: { title: "boom" } }));
    await failing.goto("/create/question");
    await expect.poll(() => failingApi.suggestBodies.length).toBe(1);
    await expect(failing.getByTestId("topic-chip")).toHaveCount(0);
    await expect(failing.getByRole("alert")).toHaveCount(0);
    await openBrowseAll(failing);
    await expect(failing.locator("#item-form-category")).toBeVisible();
  });

  test("AC 12.10 - the fallback response is labelled Common topics with Yours and Popular badges", async ({ page }) => {
    await signIn(page);
    await mockApi(page, () => ({ body: { suggestions: FALLBACK_CHIPS } }));
    await page.goto("/create/question");

    await expect(topicGroup(page).getByText("Common topics")).toBeVisible();
    await expect(topicGroup(page).getByText("Yours", { exact: true })).toBeVisible();
    await expect(topicGroup(page).getByText("Popular", { exact: true })).toBeVisible();
    await expect(topicGroup(page).getByText("Suggested from your text")).toHaveCount(0);
  });

  test("AC 12.13 - a URL prefill is the user's choice: pill, no chips, no suggest request", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/question?category=tech&keywords=ai-ml,nlp");

    await expect(page.getByTestId("topic-pill")).toContainText("nlp");
    await typeQuestion(page);
    await page.waitForTimeout(900);
    await expect(chips(page)).toHaveCount(0);
    expect(api.suggestBodies).toHaveLength(0);
  });
});

test.describe("other flows", () => {
  test("AC 12.12 - notes: pasted text yields chips, one tap fills the topic and the upload succeeds", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/notes");

    await page.getByRole("tab", { name: "Paste text" }).click();
    const notes = "Neural networks learn weights with backpropagation. Deep learning models train on large datasets.";
    await page.getByLabel("Study guide text").fill(notes);
    await expect(topicGroup(page).getByText("Suggested from your text")).toBeVisible();
    expect(api.suggestBodies.some((body) => body.text === notes)).toBe(true);

    await chips(page).first().click();
    expect(await chosenPath(page, "study-guide-upload-scope")).toEqual(["tech", "ai-ml", "deep-learning"]);
    await page.getByRole("button", { name: "Upload study guide" }).click();
    await expect.poll(() => api.documents.length).toBe(1);
    expect(api.documents[0]).toContain("deep-learning");
  });

  test("AC 12.12 - notes: a PDF suggests from its title and name and says so", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/notes");

    await page.getByLabel("Choose study guide file").setInputFiles({
      name: "neural-networks_chapter3.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });

    await expect(page.getByText("Topic suggestions use your title and file name for this file type.")).toBeVisible();
    await expect.poll(() => api.suggestBodies.some((body) => body.text === "neural networks chapter3")).toBe(true);
  });

  test("AC 12.12 - import: JSON rows drive the request, one chip fills the path, and a path is required", async ({ page }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/create/import");

    await page.getByRole("tab", { name: "JSON" }).click();
    const rows = Array.from({ length: 30 }, (_, index) => ({
      question: `What does neural network layer ${index} compute during training?`,
      correctAnswer: `Weighted sums ${index}`,
      incorrectAnswers: ["Nothing", "Random"],
    }));
    await page.getByLabel("JSON array of items").fill(JSON.stringify(rows));
    await expect(topicGroup(page).getByText("Suggested from your text")).toBeVisible();

    const sent = api.suggestBodies.map((body) => body.text ?? "").find((text) => text.length > 0)!;
    expect(sent.length).toBeLessThanOrEqual(5000);
    expect(sent).toContain("layer 19 compute");
    expect(sent).not.toContain("layer 20 compute");

    await page.getByRole("button", { name: "Upload and open collection" }).click();
    await expect(topicGroup(page).getByRole("alert")).toContainText("Choose a topic");
    expect(api.uploads).toHaveLength(0);

    await chips(page).first().click();
    await page.getByRole("button", { name: "Upload and open collection" }).click();
    await expect.poll(() => api.uploads.length).toBe(1);
    expect(api.uploads[0]).toMatchObject({ category: "tech", keyword1: "ai-ml", keyword2: "deep-learning" });
  });

  test("AC 12.11 - edit: the stored path is the pill, no chips and no suggest request, and x opens the picker", async ({
    page,
  }) => {
    await signIn(page);
    const api = await mockApi(page);
    await page.goto("/items/e2e-item-1/edit");

    await expect(page.getByTestId("topic-pill")).toContainText("nlp");
    await expect(chips(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Remove topic tech, ai-ml, nlp" }).click();
    await expect(searchBox(page)).toBeFocused();
    await searchBox(page).fill("deep");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("topic-pill")).toBeVisible();
    expect(api.suggestBodies).toHaveLength(0);
  });
});
