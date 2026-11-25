import { asUser, expect } from "./roles";
import { cleanScanSample, ocrFile } from "../ocrFixtures";

asUser("AC 6.6.67 reads a clean scan on the deployed site without submitting", async ({ page, context, baseURL }, testInfo) => {
  testInfo.setTimeout(100_000);
  const origin = new URL(baseURL!).origin;
  const assetResponses: Array<{ url: string; status: number }> = [];
  const documentWrites: string[] = [];
  let reading = false;

  // Fail closed if a regression attempts to submit while the test only reads a local fixture.
  await context.route("**/study-guides/documents**", async (route) => {
    if (route.request().method() !== "GET") {
      documentWrites.push(new URL(route.request().url()).pathname);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  context.on("response", (response) => {
    if (reading && new URL(response.url()).pathname.startsWith("/ocr/")) {
      assetResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  reading = true;
  await page.locator("#study-guide-photos").setInputFiles(await ocrFile("scanned.pdf"));
  await page.getByRole("button", { name: "Read 1 page" }).click();
  const review = page.getByRole("textbox", { name: /recognized text/i });
  await expect(review).toHaveValue(cleanScanSample, { timeout: 75_000 });
  await expect(review).toBeFocused();
  expect(documentWrites).toEqual([]);
  const assets = assetResponses.map(({ url }) => new URL(url).pathname);
  expect(assets).toContain("/ocr/pdf.worker.min.mjs");
  expect(assets).toContain("/ocr/worker.min.js");
  expect(assets.some((asset) => asset.startsWith("/ocr/core/"))).toBe(true);
  expect(assets.some((asset) => asset.endsWith("eng.traineddata.gz"))).toBe(true);
  expect(assetResponses.every(({ url, status }) => new URL(url).origin === origin && [200, 304].includes(status))).toBe(true);
  await testInfo.attach("deployed OCR asset responses", { body: JSON.stringify(assetResponses, null, 2), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("deployed-ocr-review.png"), fullPage: true });
});
