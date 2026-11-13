import { defineConfig, devices } from "@playwright/test";
import { e2eUserAgent } from "./playwright/e2eUserAgent";

// Every project sets use.userAgent to the device user agent plus a QuizymodeE2E/<run id> token, so the API classifies the
// hits as automated traffic (#573). Keep it in every project, including auth-setup and the screenshot projects.

// Defaults to the local dev server. Production is an explicit opt-in
// (PLAYWRIGHT_BASE_URL=https://www.quizymode.com) because authenticated runs add real prod DB load (#333).
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:7000";

export default defineConfig({
  testDir: "./playwright",
  outputDir: "./playwright/test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  expect: {
    timeout: 3_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    actionTimeout: 3_000,
    navigationTimeout: 5_000,
  },
  projects: [
    {
      // AC 7.8.4: CI E2E against the Development stack with the DevTest identity. No Cognito login, no secrets.
      // Traces and screenshots are kept for every test so a green run is its own evidence.
      name: "e2e-ci",
      testMatch: "**/e2e-ci/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        userAgent: e2eUserAgent(devices["Desktop Chrome"]),
        viewport: { width: 1280, height: 900 },
        trace: "on",
        screenshot: "on",
      },
    },
    {
      name: "auth-setup",
      testMatch: "**/auth.setup.ts",
      use: { ...devices["Desktop Chrome"], userAgent: e2eUserAgent(devices["Desktop Chrome"]) },
    },
    {
      name: "screenshots",
      testMatch: "**/capture.spec.ts",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        userAgent: e2eUserAgent(devices["Desktop Chrome"]),
        storageState: "playwright/.auth/user.json",
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "screenshots-mobile",
      testMatch: "**/capture.spec.ts",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Pixel 5"],
        userAgent: e2eUserAgent(devices["Pixel 5"]),
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      name: "smoke",
      testMatch: "**/e2e/**/*.spec.ts",
      grep: /@smoke/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        userAgent: e2eUserAgent(devices["Desktop Chrome"]),
        storageState: "playwright/.auth/user.json",
        viewport: { width: 1280, height: 900 },
        screenshot: "on",
      },
    },
    {
      name: "e2e-full",
      testMatch: "**/e2e/**/*.spec.ts",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        userAgent: e2eUserAgent(devices["Desktop Chrome"]),
        storageState: "playwright/.auth/user.json",
        viewport: { width: 1280, height: 900 },
        screenshot: "on",
      },
    },
  ],
});
