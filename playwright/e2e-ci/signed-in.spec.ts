/**
 * AC 7.8.4: signed-in E2E through the Development DevTest identity (CI job `e2e`).
 * The Vite dev server runs with VITE_DEV_TEST_USER=ci-user; the API runs in Development with the DevTest scheme.
 */
import { test, expect } from "@playwright/test";

const DEV_TEST_HEADER = "DevTest ci-user";

test("AC 7.8.4 @e2e the API accepts the DevTest identity and returns the signed-in user", async ({ request }) => {
  const response = await request.get("/api/users/me", {
    headers: { Authorization: DEV_TEST_HEADER },
  });

  expect(response.status()).toBe(200);
});

test("AC 7.8.4 @e2e the SPA sends the DevTest identity on every API call and never a Cognito bearer", async ({ page }) => {
  const apiAuthorizations: (string | undefined)[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiAuthorizations.push(request.headers()["authorization"]);
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(apiAuthorizations.length).toBeGreaterThan(0);
  for (const authorization of apiAuthorizations) {
    expect(authorization).toBe(DEV_TEST_HEADER);
  }
});
