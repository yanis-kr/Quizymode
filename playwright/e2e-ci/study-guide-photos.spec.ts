/**
 * Photos or scan on /create/notes (#748, AC 6.6.44). The photo is drawn in the browser and read on-device, so the
 * assertions are about where the recognition requests go: only the app's own origin, never a third-party host.
 */
import { test, expect } from "../fixtures";
import type { Page, Route } from "@playwright/test";

const config = {
  enabled: true,
  maxFileBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxTextBytes: 100_000,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
  freeTierDelayMinutes: 10,
  quota: { tier: "Free", dailyLimit: 10, dailyUsed: 0, monthlyLimit: 60, monthlyUsed: 0, remainingToday: 10 },
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    // Only API calls are stubbed; the app's own /ocr/ assets and source modules load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/study-guides/documents/config")) return json(config);
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/categories")) return json({ categories: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

test("AC 6.6.44 photos are read in the browser and no request goes to a host other than the app", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await stubApi(page);
  const appHost = new URL(baseURL ?? "http://localhost:7000").host;
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));

  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();

  // A large, plain word drawn on a canvas, so recognition has clean text to read.
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 300;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    context.font = "bold 120px Arial, sans-serif";
    context.fillText("Photosynthesis", 40, 180);
    return canvas.toDataURL("image/png").split(",")[1];
  });

  await page.locator("#study-guide-photos").setInputFiles({
    name: "page.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBase64, "base64"),
  });

  const review = page.getByLabel("Recognized text (review and correct before you submit) *");
  await expect(review).toHaveValue(/photosynthesis/i, { timeout: 150_000 });

  // Every request during recognition went to the app's own origin.
  expect([...hosts].filter((host) => host !== appHost), "third-party hosts contacted").toEqual([]);
});

/** A one-page PDF with a single line of text, built byte by byte so the xref offsets are exact. */
function buildTextPdf(line: string): Buffer {
  const content = `BT /F1 48 Tf 30 80 Td (${line}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("AC 6.6.51 reading a scanned PDF loads the pdf.js worker from /ocr/ and contacts no other host", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await stubApi(page);
  const appHost = new URL(baseURL ?? "http://localhost:7000").host;
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));

  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  await page.locator("#study-guide-scan-pdf").setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: buildTextPdf("Photosynthesis"),
  });
  await page.getByRole("button", { name: /^read 1 page$/i }).click();

  const review = page.getByLabel("Recognized text (review and correct before you submit) *");
  await expect(review).toHaveValue(/photosynthesis/i, { timeout: 150_000 });
  expect([...hosts].filter((host) => host !== appHost), "third-party hosts contacted").toEqual([]);
});
