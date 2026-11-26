/**
 * Photos or scan on /create/notes under mobile device emulation (#365, AC 6.6.68).
 *
 * Runs on two profiles from playwright.config.ts: `e2e-mobile-ios` (iPhone 15 profile on WebKit) and
 * `e2e-mobile-android` (Pixel 7 profile on Chromium). Emulation sets the viewport, touch, device pixel ratio and user agent;
 * it does not drive a physical camera, so real camera capture stays unverified and optional.
 *
 * Each test attaches `ocr-mobile-evidence` (browser, profile, fixture, result) so the JSON report records what ran.
 */
import { test, expect } from "../../fixtures";
import type { Page, Route, TestInfo } from "@playwright/test";
import { cleanScanSample, goldenWordAccuracy, ocrFile } from "../../ocrFixtures";

const HEIC_GUIDANCE =
  "This browser can't open this HEIC photo. Choose a JPEG or PNG, or set the iPhone camera to Most Compatible.";

const config = {
  enabled: true,
  maxFileBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxTextBytes: 100_000,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
  freeTierDelayMinutes: 10,
  quota: { tier: "Free", dailyLimit: 10, dailyUsed: 0, monthlyLimit: 60, monthlyUsed: 0, remainingToday: 10 },
};

/** Stubs the API only; the app's own /ocr/ assets and source modules load normally. */
async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/study-guides/documents/config")) return json(config);
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/taxonomy/suggest")) return json({ suggestions: [] });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

async function openPhotosTab(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  await expect(page.locator("#study-guide-photos")).toBeAttached();
}

/** The report keeps this next to the pass/fail result: which browser, which device profile, which fixture, what happened. */
async function recordEvidence(page: Page, testInfo: TestInfo, fixture: string, result: string): Promise<void> {
  const evidence = {
    ac: "6.6.68",
    project: testInfo.project.name,
    browser: page.context().browser()?.browserType().name() ?? "unknown",
    browserVersion: page.context().browser()?.version() ?? "unknown",
    profile: String(testInfo.project.metadata.profile ?? "unknown"),
    viewport: page.viewportSize(),
    touch: await page.evaluate(() => navigator.maxTouchPoints > 0),
    fixture,
    result,
    physicalCameraCapture: "unverified (optional)",
  };
  await testInfo.attach("ocr-mobile-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  testInfo.annotations.push({ type: "ocr-mobile-evidence", description: `${evidence.browser} / ${evidence.profile} / ${fixture}: ${result}` });
}

test("AC 6.6.68 a JPEG photo is recognized and focused for review on the mobile profile", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPhotosTab(page);
  const review = page.getByRole("textbox", { name: /recognized text/i });

  await page.locator("#study-guide-photos").setInputFiles(await ocrFile("exif-rotated.jpg"));
  await expect(review).toHaveValue(cleanScanSample, { timeout: 150_000 });
  await expect(review).toBeFocused();
  const accuracy = goldenWordAccuracy(await review.inputValue());
  expect(accuracy).toBeGreaterThanOrEqual(0.9);
  await recordEvidence(page, testInfo, "playwright/fixtures/study-guide-ocr/exif-rotated.jpg", `recognized, ${(accuracy * 100).toFixed(0)}% golden word accuracy, review focused`);
});

test("AC 6.6.68 a HEIC photo this browser cannot decode shows the documented fallback and keeps the tab usable", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await openPhotosTab(page);

  // An ISO base media `ftyp heic` header with no image data: the browser cannot decode it, so the HEIC guidance must show.
  // This verifies the fallback path. It does not claim that a real iPhone HEIC photo decodes: there is no HEIC fixture.
  const heicHeader = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(12)]);
  await page.locator("#study-guide-photos").setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: heicHeader });

  await expect(page.getByText(HEIC_GUIDANCE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#study-guide-photos")).toBeEnabled();
  await expect(page.locator("#study-guide-camera")).toBeEnabled();
  await recordEvidence(page, testInfo, "synthetic IMG_0001.HEIC (ftyp heic header, no image data)", "fallback shown: " + HEIC_GUIDANCE);
});

test("AC 6.6.68 Take photo asks for the rear camera and is a touch-sized control", async ({ page }, testInfo) => {
  await openPhotosTab(page);
  const camera = page.locator("#study-guide-camera");

  await expect(camera).toHaveAttribute("capture", "environment");
  await expect(camera).toHaveAttribute("type", "file");
  const accept = (await camera.getAttribute("accept")) ?? "";
  expect(accept).toContain("image/jpeg");
  expect(accept).not.toContain("application/pdf");
  expect(await camera.evaluate((input) => (input as HTMLInputElement).multiple)).toBe(false);

  const takePhoto = page.locator("label", { has: camera });
  await expect(takePhoto).toContainText("Take photo");
  const box = await takePhoto.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal page scroll").toBeLessThanOrEqual(0);
  await recordEvidence(page, testInfo, "none (input attributes)", `capture="environment", accept="${accept}", Take photo ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} px, no horizontal scroll`);
});
