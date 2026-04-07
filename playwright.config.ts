import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://www.quizymode.com";

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
      name: "auth-setup",
      testMatch: "**/auth.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "screenshots",
      testMatch: "**/capture.spec.ts",
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
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
        storageState: "playwright/.auth/user.json",
        viewport: { width: 1280, height: 900 },
        screenshot: "on",
      },
    },
  ],
});
