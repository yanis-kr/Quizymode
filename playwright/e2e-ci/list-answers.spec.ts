/**
 * Signed-in list answers (#647, AC 4.7.14, AC 4.7.15) through the Development DevTest identity (CI job `e2e`).
 * The SPA sends `DevTest ci-user`. Server settings are real for the persistence test and answered by a route stub where a
 * test needs a known server state (the API cannot delete a setting), so the tests do not depend on each other's order.
 */
import { test, expect } from "../fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

const DEV_TEST_HEADER = "DevTest ci-user";
const STORAGE_KEY = "quizymode.list.show-answers.v1";

async function listPath(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/items?page=1&pageSize=1", { headers: { Authorization: DEV_TEST_HEADER } });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { category: string }[] };
  expect(body.items.length).toBeGreaterThan(0);
  return `/categories/${encodeURIComponent(body.items[0]!.category.toLowerCase())}?view=items`;
}

/** Answers the settings GET with a fixed server state; PUTs pass through. */
async function stubServerSettings(page: Page, settings: Record<string, string>): Promise<void> {
  await page.route("**/api/users/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings }) });
  });
}

async function setLocalChoice(page: Page, value: string | null): Promise<void> {
  await page.addInitScript(
    ([key, stored]) => {
      if (stored === null) window.localStorage.removeItem(key as string);
      else window.localStorage.setItem(key as string, stored as string);
    },
    [STORAGE_KEY, value],
  );
}

async function openList(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Show answers" })).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Show answer", exact: true }).or(page.getByText("Answer:").first()).first()).toBeVisible({
    timeout: 10_000,
  });
}

test("AC 4.7.15 @e2e a user who never set HideAnswers has no such setting on the server", async ({ request }) => {
  const identity = `DevTest ci-fresh-${Date.now()}`;
  expect((await request.get("/api/users/me", { headers: { Authorization: identity } })).status()).toBe(200);
  const response = await request.get("/api/users/settings", { headers: { Authorization: identity } });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { settings: Record<string, string> };
  expect(body.settings).not.toHaveProperty("HideAnswers");
});

test("AC 4.7.15 @e2e a signed-in list with no HideAnswers setting hides every answer and offers Show answer", async ({ page, request }) => {
  const path = await listPath(request);
  await stubServerSettings(page, {});
  await setLocalChoice(page, null);
  await openList(page, path);

  await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Answer:")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show answer", exact: true }).first()).toBeVisible();
});

test("AC 4.7.15 @e2e a saved HideAnswers value of false keeps answers visible", async ({ page, request }) => {
  const path = await listPath(request);
  await stubServerSettings(page, { HideAnswers: "false" });
  await setLocalChoice(page, null);
  await openList(page, path);

  await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Answer:").first()).toBeVisible();
});

test("AC 4.7.14 @e2e the signed-in server setting wins over the browser's saved choice", async ({ page, request }) => {
  const path = await listPath(request);
  await stubServerSettings(page, { HideAnswers: "true" });
  await setLocalChoice(page, "true");
  await openList(page, path);

  await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Answer:")).toHaveCount(0);
});

test("AC 4.7.14 @e2e without a server value the browser's saved choice applies, and ?showAnswers= overrides both", async ({ page, request }) => {
  const path = await listPath(request);
  await stubServerSettings(page, {});
  await setLocalChoice(page, "true");
  await openList(page, path);
  await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Answer:").first()).toBeVisible();

  await page.goto(`${path}&showAnswers=false`);
  await expect(page.getByRole("button", { name: "Show answers" })).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Answer:")).toHaveCount(0);
});

test("AC 4.7.14 @e2e toggling Show answers saves HideAnswers on the server and the choice survives a reload", async ({ page, request }) => {
  const path = await listPath(request);
  try {
    // Real server state: start hidden, then turn answers on.
    const hide = await request.put("/api/users/settings", {
      headers: { Authorization: DEV_TEST_HEADER },
      data: { key: "HideAnswers", value: "true" },
    });
    expect(hide.status()).toBe(200);
    await setLocalChoice(page, null);
    await openList(page, path);
    await expect(page.getByText("Answer:")).toHaveCount(0);

    const saved = page.waitForResponse(
      (response) => response.url().includes("/api/users/settings") && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Show answers" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Answer:").first()).toBeVisible();

    const settings = await request.get("/api/users/settings", { headers: { Authorization: DEV_TEST_HEADER } });
    expect(((await settings.json()) as { settings: Record<string, string> }).settings.HideAnswers).toBe("false");

    await page.reload();
    await expect(page.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    await expect(page.getByText("Answer:").first()).toBeVisible();
  } finally {
    await request.put("/api/users/settings", {
      headers: { Authorization: DEV_TEST_HEADER },
      data: { key: "HideAnswers", value: "true" },
    });
  }
});
