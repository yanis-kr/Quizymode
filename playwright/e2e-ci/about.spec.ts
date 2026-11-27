/**
 * About page (#883, #884, #885). The API is stubbed, so the page does not depend on the catalog or the starter pool content.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const textEntry = {
  world: "space",
  wowLine: "Venus takes longer to spin once than to go around the Sun.",
  item: {
    id: "00000000-0000-0000-0000-0000000000a1",
    category: "science",
    isPrivate: false,
    question: "Which planet takes longer to spin once than to orbit the Sun?",
    correctAnswer: "Venus",
    incorrectAnswers: ["Mars", "Mercury", "Neptune"],
    explanation: "",
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [],
    source: "https://science.nasa.gov/venus/",
  },
};
// A picture question the hook must skip.
const pictureEntry = {
  world: "flags",
  wowLine: "A flag.",
  item: { ...textEntry.item, id: "00000000-0000-0000-0000-0000000000a2", question: "Whose flag is this?", questionImage: { url: "/m/x.webp", width: 4, height: 3 } },
};

type PoolMode = { kind: "pool"; items: unknown[] } | { kind: "fail" };

async function stubApi(
  page: Page,
  poolMode: PoolMode = { kind: "fail" },
  collections: Record<string, unknown> = {}
): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; source modules under /src/ must load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/starter-pool")) {
      if (poolMode.kind === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return json({ version: "test", items: poolMode.items });
    }
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    // GET /collections/{id} for the About cards: listed ids answer, any other id fails with 500.
    const collectionId = /^\/api\/collections\/([0-9a-f-]{36})$/.exec(pathname)?.[1];
    if (collectionId) {
      const body = collections[collectionId];
      if (!body) return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return json(body);
    }
    // Unknown endpoints get every list field empty so no page hook reads undefined.
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 3.0.37 at 390x844 the About heading and Try 5 questions are above the fold, the button is 44 px tall and links to /start, and Browse topics links to /categories", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubApi(page);
  await page.goto("/about");

  const heading = page.getByRole("heading", { level: 1, name: "A quiz app that got a little out of hand." });
  const tryIt = page.getByRole("link", { name: "Try 5 questions" });
  await expect(heading).toBeInViewport();
  await expect(tryIt).toBeInViewport();
  await expect(tryIt).toHaveAttribute("href", "/start");
  const box = await tryIt.boundingBox();
  expect(box?.height ?? 0, "Try 5 questions height").toBeGreaterThanOrEqual(44);
  expect((box?.y ?? Infinity) + (box?.height ?? 0), "Try 5 questions bottom edge").toBeLessThanOrEqual(844);
  await expect(page.getByRole("link", { name: "Browse topics" })).toHaveAttribute("href", "/categories");
});

test("AC 3.0.52 the hook shows one text question, marks my pick, reveals the answer, explanation and source, announces the result and moves focus to it", async ({ page }) => {
  await stubApi(page, { kind: "pool", items: [pictureEntry, textEntry] });
  await page.goto("/about");

  const hook = page.getByTestId("about-hook");
  await expect(hook.getByTestId("about-hook-question")).toHaveText(textEntry.item.question);
  const options = hook.locator("ul button");
  await expect(options).toHaveCount(4);

  await hook.getByRole("button", { name: "Mars" }).click();
  const result = page.getByTestId("about-hook-result");
  await expect(result).toContainText("Not quite. Now you know, which was the point.");
  await expect(result).toContainText(textEntry.wowLine);
  await expect(hook.getByRole("button", { name: /Mars/ })).toContainText("Your pick");
  await expect(hook.getByRole("button", { name: /Venus/ })).toContainText("Right answer");
  const source = result.getByRole("link", { name: "science.nasa.gov" });
  await expect(source).toHaveAttribute("href", "https://science.nasa.gov/venus/");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
  const live = page.getByTestId("about-hook-announcement");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("Not quite. The answer is Venus.");
  await expect(result).toBeFocused();
  await expect(result.getByRole("link", { name: "Play all 5" })).toHaveAttribute("href", "/start");
});

test("AC 3.0.55 when the starter pool request fails the hook shows the static fallback question and the rest of the page is unaffected", async ({ page }) => {
  await stubApi(page, { kind: "fail" });
  await page.goto("/about");

  const hook = page.getByTestId("about-hook");
  await expect(hook.getByTestId("about-hook-question")).toHaveText("Which planet is less dense than water, so it would float in a giant bathtub?");
  await expect(hook.locator("ul button")).toHaveCount(4);
  await expect(page.getByRole("heading", { level: 1, name: "A quiz app that got a little out of hand." })).toBeVisible();
  await expect(page.locator("section[aria-labelledby] > h2")).toHaveCount(7);
  await expect(page.getByRole("link", { name: "Source on GitHub" })).toBeVisible();

  await hook.getByRole("button", { name: "Saturn" }).click();
  await expect(page.getByTestId("about-hook-result")).toContainText("Correct. You are now slightly more fun at dinner.");
  await expect(page.getByTestId("about-hook-result").getByRole("link", { name: "science.nasa.gov" })).toHaveAttribute(
    "href",
    "https://science.nasa.gov/saturn/facts/"
  );
});

const AHA_ID = "e0eaca22-3e39-4f07-92e6-046baab0d3ea";
const SOUNDS_FAKE_ID = "3c85dfe2-4365-406d-8056-d30bc451dd20";
const LANDMARKS_ID = "abdbb0fd-ea31-4890-8a20-831592be74e3";

const collectionBody = (id: string, name: string, itemCount: number, description: string) => ({
  id,
  name,
  description,
  itemCount,
  createdBy: "seeder",
  createdAt: "2026-04-08T00:00:00Z",
  isPublic: true,
  isDiscoverable: true,
});

test("AC 3.0.58 the About collection cards link to /collections/{id} and show the API question count; a collection that fails to load hides only its own card", async ({ page }) => {
  // Counts differ from the seed files on purpose, so the test proves the card shows what the API returned.
  await stubApi(page, { kind: "fail" }, {
    [AHA_ID]: collectionBody(AHA_ID, "Aha Moment Trivia", 41, "Clue-driven trivia."),
    [LANDMARKS_ID]: collectionBody(LANDMARKS_ID, "Landmarks from Sideways Clues", 17, "Famous places from indirect clues."),
  });
  await page.goto("/about");

  const explore = page.getByRole("region", { name: "Start with something odd." });
  const cards = explore.getByTestId("about-collection-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-collection-id", AHA_ID);
  await expect(cards.nth(0).getByRole("link", { name: "Aha Moment Trivia" })).toHaveAttribute("href", `/collections/${AHA_ID}`);
  await expect(cards.nth(0).getByTestId("about-collection-count")).toHaveText("41 questions");
  await expect(cards.nth(0)).toContainText("Clue-driven trivia.");
  await expect(cards.nth(1)).toHaveAttribute("data-collection-id", LANDMARKS_ID);
  await expect(cards.nth(1).getByRole("link", { name: "Landmarks from Sideways Clues" })).toHaveAttribute(
    "href",
    `/collections/${LANDMARKS_ID}`
  );
  await expect(cards.nth(1).getByTestId("about-collection-count")).toHaveText("17 questions");
  await expect(explore.locator(`[data-collection-id="${SOUNDS_FAKE_ID}"]`)).toHaveCount(0);
  await expect(explore.getByRole("link", { name: "All featured topics" })).toHaveAttribute("href", "/featured");

  await cards.nth(1).getByRole("link", { name: "Landmarks from Sideways Clues" }).click();
  await expect(page).toHaveURL(new RegExp(`/collections/${LANDMARKS_ID}$`));
});
