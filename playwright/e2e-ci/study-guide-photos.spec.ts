/**
 * Photos or scan on /create/notes (#748, AC 6.6.44). The photo is drawn in the browser and read on-device, so the
 * assertions are about where the recognition requests go: only the app's own origin, never a third-party host.
 */
import { test, expect } from "../fixtures";
import type { Locator, Page, Route } from "@playwright/test";

const config = {
  enabled: true,
  maxFileBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxTextBytes: 100_000,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
  freeTierDelayMinutes: 10,
  quota: { tier: "Free", dailyLimit: 10, dailyUsed: 0, monthlyLimit: 60, monthlyUsed: 0, remainingToday: 10 },
};

async function stubApi(
  page: Page,
  onQuickRequest?: (body: string, contentType: string) => void,
  onCreateRequest?: (body: string, contentType: string) => void,
): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    // Only API calls are stubbed; the app's own /ocr/ assets and source modules load normally.
    if (!pathname.startsWith("/api/")) return route.fallback();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/api/study-guides/documents/config")) return json(config);
    if (pathname.endsWith("/api/users/settings")) return json({ settings: {} });
    if (pathname.endsWith("/api/taxonomy/suggest")) return json({ suggestions: [] });
    if (pathname.endsWith("/api/taxonomy")) {
      return json({
        categories: [
          {
            slug: "science",
            name: "Science",
            description: null,
            itemCount: 1,
            groups: [{ slug: "biology", description: null, itemCount: 1, keywords: [{ slug: "plants", description: null, itemCount: 1 }] }],
            allKeywordSlugs: ["biology", "plants"],
          },
        ],
      });
    }
    if (pathname.endsWith("/api/study-guides/documents/quick")) {
      onQuickRequest?.(request.postData() ?? "", request.headers()["content-type"] ?? "");
      return json({
        document: { id: "doc-ocr", title: "Photo notes", isDuplicate: false, collectionId: null },
        outcome: "Generating",
        message: "Making your quiz.",
        queuedCount: 1,
        cachedCount: 0,
        chargedSections: 1,
        collectionName: null,
      });
    }
    if (pathname.endsWith("/api/study-guides/documents") && request.method() === "POST") {
      onCreateRequest?.(request.postData() ?? "", request.headers()["content-type"] ?? "");
      return json({ id: "doc-review", title: "Photo notes", status: "Created" });
    }
    if (pathname.endsWith("/api/categories")) return json({ categories: [] });
    if (pathname.endsWith("/api/keywords")) return json({ keywords: [] });
    return json({ settings: {}, keywords: [], names: [], sets: [], collections: [], items: [], categories: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
}

async function recognizePhoto(page: Page): Promise<{ review: Locator; originalBytes: Buffer }> {
  await page.getByRole("tab", { name: "Photos or scan" }).click();
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
  const originalBytes = Buffer.from(pngBase64, "base64");
  await page.locator("#study-guide-photos").setInputFiles({
    name: "page.png",
    mimeType: "image/png",
    buffer: originalBytes,
  });
  const review = page.getByLabel("Recognized text (review and correct before you submit) *");
  await expect(review).toHaveValue(/photosynthesis/i, { timeout: 150_000 });
  await review.fill("Edited photosynthesis notes");
  return { review, originalBytes };
}

async function chooseTopic(page: Page): Promise<void> {
  await page.getByText("Browse all topics").click();
  await page.getByLabel("Category *").selectOption("science");
  await page.getByLabel("Primary topic (rank 1) *").selectOption("biology");
  await page.getByLabel("Subtopic (rank 2) *").selectOption("plants");
}

function expectTextOnly(body: string, contentType: string): void {
  expect(contentType).toContain("multipart/form-data");
  const fieldNames = [...body.matchAll(/Content-Disposition: form-data; name="([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
  expect(fieldNames).toEqual(["category", "navigationKeyword1", "navigationKeyword2", "text"]);
  expect(body).toContain('name="text"\r\n\r\nEdited photosynthesis notes\r\n');
  expect(body).toContain('name="category"\r\n\r\nscience\r\n');
  expect(body).toContain('name="navigationKeyword1"\r\n\r\nbiology\r\n');
  expect(body).toContain('name="navigationKeyword2"\r\n\r\nplants\r\n');
}

function monitorOcrNetwork(page: Page) {
  const hosts = new Set<string>();
  const requestBodies: Buffer[] = [];
  const ocrResponses: Array<{ pathname: string; status: number }> = [];
  page.on("request", (request) => {
    hosts.add(new URL(request.url()).host);
    const body = request.postDataBuffer();
    if (body) requestBodies.push(body);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/ocr/")) ocrResponses.push({ pathname: url.pathname, status: response.status() });
  });
  return { hosts, requestBodies, ocrResponses };
}

function expectOcrNetworkOnOwnOrigin(
  monitor: ReturnType<typeof monitorOcrNetwork>,
  appHost: string,
  originalFileBytes: Buffer,
): void {
  expect([...monitor.hosts].filter((host) => host !== appHost), "third-party hosts contacted").toEqual([]);
  expect(monitor.ocrResponses.length, "OCR assets were requested").toBeGreaterThan(0);
  expect(monitor.ocrResponses.every((response) => response.status === 200), "OCR asset responses").toBe(true);
  expect(monitor.requestBodies.some((body) => body.includes(originalFileBytes)), "original file bytes were sent").toBe(false);
  expect(
    monitor.requestBodies.some((body) => body.includes(originalFileBytes.toString("base64"))),
    "base64-encoded original file bytes were sent",
  ).toBe(false);
}

test("AC 6.6.44 and AC 6.6.48 photos are read locally and submitted as text only", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  let quickBody = "";
  let quickContentType = "";
  await stubApi(page, (body, contentType) => {
    quickBody = body;
    quickContentType = contentType;
  });
  const appHost = new URL(baseURL ?? "http://localhost:7000").host;
  const monitor = monitorOcrNetwork(page);

  await page.goto("/create/notes");
  const { review, originalBytes } = await recognizePhoto(page);
  await expect(review).toHaveValue("Edited photosynthesis notes");
  await chooseTopic(page);
  await page.getByRole("button", { name: "Make a quiz" }).click();
  await expect.poll(() => quickBody).toContain("Edited photosynthesis notes");
  expectTextOnly(quickBody, quickContentType);

  // Recognition and its text-only submission use the app's own origin.
  expectOcrNetworkOnOwnOrigin(monitor, appHost, originalBytes);
});

test("AC 6.6.48 Choose sections and review first submits photo text only", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  let createBody = "";
  let createContentType = "";
  const appHost = new URL(baseURL ?? "http://localhost:7000").host;
  const monitor = monitorOcrNetwork(page);
  await stubApi(page, undefined, (body, contentType) => {
    createBody = body;
    createContentType = contentType;
  });
  await page.goto("/create/notes");
  const { originalBytes } = await recognizePhoto(page);
  await chooseTopic(page);
  await page.getByRole("button", { name: "Choose sections and review first" }).click();
  await expect.poll(() => createBody).toContain("Edited photosynthesis notes");
  expectTextOnly(createBody, createContentType);
  expectOcrNetworkOnOwnOrigin(monitor, appHost, originalBytes);
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

test("AC 6.6.48 and AC 6.6.51 scanned PDFs stay local and submit reviewed text only", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  let quickBody = "";
  let quickContentType = "";
  await stubApi(page, (body, contentType) => {
    quickBody = body;
    quickContentType = contentType;
  });
  const appHost = new URL(baseURL ?? "http://localhost:7000").host;
  const monitor = monitorOcrNetwork(page);

  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  const originalBytes = buildTextPdf("Photosynthesis");
  await page.locator("#study-guide-scan-pdf").setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: originalBytes,
  });
  await page.getByRole("button", { name: /^read 1 page$/i }).click();

  const review = page.getByLabel("Recognized text (review and correct before you submit) *");
  await expect(review).toHaveValue(/photosynthesis/i, { timeout: 150_000 });
  await review.fill("Edited photosynthesis notes");
  await chooseTopic(page);
  await page.getByRole("button", { name: "Make a quiz" }).click();
  await expect.poll(() => quickBody).toContain("Edited photosynthesis notes");
  expectTextOnly(quickBody, quickContentType);
  expect(monitor.ocrResponses.some((response) => response.pathname.endsWith("/pdf.worker.min.mjs"))).toBe(true);
  expectOcrNetworkOnOwnOrigin(monitor, appHost, originalBytes);
});
