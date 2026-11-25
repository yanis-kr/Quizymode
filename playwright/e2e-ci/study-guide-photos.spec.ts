/**
 * Photos or scan on /create/notes (#748, AC 6.6.44). The photo is drawn in the browser and read on-device, so the
 * assertions are about where the recognition requests go: only the app's own origin, never a third-party host.
 */
import { test, expect } from "../fixtures";
import type { Locator, Page, Route } from "@playwright/test";
import fs from "node:fs/promises";
import { cleanScanSample, goldenWordAccuracy, ocrFile, ocrFixture } from "../ocrFixtures";

test.use({ navigationTimeout: 20_000, actionTimeout: 10_000 });
test.describe.configure({ timeout: 45_000 });

const config = {
  enabled: true,
  maxFileBytes: 128 * 1024,
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
  await page.getByRole("button", { name: /more options/i }).click();
  await page.getByLabel(/^title/i).fill("Photo notes");
  await page.getByLabel(/^keywords/i).fill("photosynthesis");
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
  expect(fieldNames).toEqual(["category", "keywords", "navigationKeyword1", "navigationKeyword2", "text", "title"]);
  expect(body).toContain('name="text"\r\n\r\nEdited photosynthesis notes\r\n');
  expect(body).toContain('name="title"\r\n\r\nPhoto notes\r\n');
  expect(body).toContain('name="keywords"\r\n\r\nphotosynthesis\r\n');
  expect(body).toContain('name="category"\r\n\r\nscience\r\n');
  expect(body).toContain('name="navigationKeyword1"\r\n\r\nbiology\r\n');
  expect(body).toContain('name="navigationKeyword2"\r\n\r\nplants\r\n');
}

function monitorOcrNetwork(page: Page) {
  const hosts = new Set<string>();
  const requestBodies: Buffer[] = [];
  const submits: string[] = [];
  const ocrResponses: Array<{ pathname: string; status: number }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    hosts.add(url.host);
    if (request.method() === "POST" && /^\/api\/study-guides\/documents(?:\/quick)?$/.test(url.pathname)) {
      submits.push(url.pathname);
    }
    const body = request.postDataBuffer();
    if (body) requestBodies.push(body);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/ocr/")) ocrResponses.push({ pathname: url.pathname, status: response.status() });
  });
  return { hosts, requestBodies, ocrResponses, submits };
}

function expectOcrNetworkOnOwnOrigin(
  monitor: ReturnType<typeof monitorOcrNetwork>,
  appHost: string,
  originalFileBytes: Buffer,
): void {
  expect([...monitor.hosts].filter((host) => host !== appHost), "third-party hosts contacted").toEqual([]);
  expect(monitor.submits).toHaveLength(1);
  const assets = monitor.ocrResponses.map((response) => response.pathname);
  expect(assets).toContain("/ocr/worker.min.js");
  expect(assets.some((asset) => asset.startsWith("/ocr/core/"))).toBe(true);
  expect(assets.some((asset) => asset.endsWith("eng.traineddata.gz"))).toBe(true);
  expect(monitor.ocrResponses.every((response) => response.status === 200), "OCR asset responses").toBe(true);
  expect(monitor.requestBodies.some((body) => body.includes(originalFileBytes)), "original file bytes were sent").toBe(false);
  expect(
    monitor.requestBodies.some((body) => body.includes(originalFileBytes.toString("base64"))),
    "base64-encoded original file bytes were sent",
  ).toBe(false);
}

test("AC 6.6.44, AC 6.6.48 and AC 6.6.62 photos are read locally and submitted as text only", async ({ page, baseURL }) => {
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

test("AC 6.6.48 and AC 6.6.62 Choose sections and review first submits photo text only", async ({ page, baseURL }) => {
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

test("AC 6.6.48, AC 6.6.51 and AC 6.6.62 scanned PDFs stay local and submit reviewed text only", async ({ page, baseURL }) => {
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
  const originalBytes = await fs.readFile(ocrFixture("scanned.pdf"));
  await page.locator("#study-guide-photos").setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: originalBytes,
  });
  await page.getByRole("button", { name: /^read 1 page$/i }).click();

  const review = page.getByLabel("Recognized text (review and correct before you submit) *");
  await expect(review).toHaveValue(cleanScanSample, { timeout: 75_000 });
  await review.fill("Edited photosynthesis notes");
  await chooseTopic(page);
  await page.getByRole("button", { name: "Make a quiz" }).click();
  await expect.poll(() => quickBody).toContain("Edited photosynthesis notes");
  expectTextOnly(quickBody, quickContentType);
  expect(monitor.ocrResponses.some((response) => response.pathname.endsWith("/pdf.worker.min.mjs"))).toBe(true);
  expectOcrNetworkOnOwnOrigin(monitor, appHost, originalBytes);
});

test("AC 6.6.62 OCR preview keeps the original file and recognized text in page memory", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  const attemptedThirdParty: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      attemptedThirdParty.push(url.origin);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__ocrStorageWrites", { value: writes });
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      writes.push(JSON.stringify([key, value]));
      return setItem.call(this, key, value);
    };
    for (const operation of ["add", "put"] as const) {
      const original = IDBObjectStore.prototype[operation];
      IDBObjectStore.prototype[operation] = function (value, key) {
        writes.push(JSON.stringify([this.name, key, value instanceof File ? value.name : value]));
        return original.call(this, value, key);
      };
    }
    const cachePut = Cache.prototype.put;
    Cache.prototype.put = function (request, response) {
      const url = request instanceof Request ? request.url : String(request);
      writes.push(url);
      void response.clone().text().then((text) => writes.push(text));
      return cachePut.call(this, request, response);
    };
  });

  await stubApi(page);
  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  const review = page.getByRole("textbox", { name: /recognized text/i });
  await expect(review).toBeVisible();
  // The shared form can request its common topics on mount. Begin capture after setup.
  await expect(page.locator("#study-guide-photos")).toBeAttached();
  const original = await fs.readFile(ocrFixture("clean.png"));
  const apiRequests: string[] = [];
  const transmitted: Buffer[] = [];
  const logs: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(request.method() + " " + url.pathname);
    transmitted.push(Buffer.from(request.url()));
    const body = request.postDataBuffer();
    if (body) transmitted.push(body);
  });
  page.on("console", (message) => logs.push(message.text()));
  page.on("pageerror", (error) => logs.push(error.message));
  await page.locator("#study-guide-photos").setInputFiles({
    name: "private-original-ocr-fixture.png",
    mimeType: "image/png",
    buffer: original,
  });
  await expect(review).toHaveValue(cleanScanSample, { timeout: 75_000 });
  await expect(review).toBeFocused();
  // Topic suggestions are debounced by 600 ms. Observe the whole debounce window before checking requests.
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 800)));
  const sourceMarkers = [cleanScanSample, /private-original-ocr-fixture[.]png/i];
  expect(attemptedThirdParty).toEqual([]);
  expect(apiRequests).toEqual([]);
  for (const value of transmitted) {
    expect(value.includes(original)).toBe(false);
    expect(value.includes(original.toString("base64"))).toBe(false);
    expect(sourceMarkers.some((marker) => marker.test(value.toString("utf8")))).toBe(false);
  }
  const storage = await page.evaluate(() => {
    const writes = (window as unknown as { __ocrStorageWrites: string[] }).__ocrStorageWrites;
    return JSON.stringify([writes, { ...window.localStorage }, { ...window.sessionStorage }]);
  });
  const browserState = JSON.stringify(await context.storageState({ indexedDB: true }));
  for (const value of [storage, browserState, logs.join("\n")]) {
    expect(value).not.toContain(original.toString("base64"));
    for (const marker of sourceMarkers) expect(value).not.toMatch(marker);
  }

  await page.getByRole("tab", { name: "Paste text" }).click();
  await expect(page.getByRole("textbox", { name: /study guide text/i })).not.toHaveValue(cleanScanSample);
  await page.reload();
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  await expect(page.getByRole("textbox", { name: /recognized text/i })).toHaveValue("");
});

test("AC 6.6.63 OCR and PDF code load only when the corresponding input is opened", async ({ page, context }) => {
  const modules: string[] = [];
  context.on("request", (request) => modules.push(new URL(request.url()).pathname));
  const ocrModule = /PhotoOcrPanel|photoRecognizer|tesseract/i;
  const pdfModule = /pdfPages|pdfjs-dist|pdf[.]worker/i;
  await stubApi(page);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Turn notes into a quiz" })).toBeVisible();
  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Paste text" }).click();
  expect(modules.filter((url) => ocrModule.test(url) || pdfModule.test(url) || url.startsWith("/ocr/"))).toEqual([]);

  await page.getByRole("tab", { name: "Photos or scan" }).click();
  await expect(page.locator("#study-guide-photos")).toBeAttached();
  expect(modules.some((url) => ocrModule.test(url))).toBe(true);
  expect(modules.some((url) => pdfModule.test(url) || url.startsWith("/ocr/"))).toBe(false);

  await page.locator("#study-guide-photos").setInputFiles(await ocrFile("scanned.pdf"));
  await expect(page.getByRole("button", { name: "Read 1 page" })).toBeVisible();
  expect(modules.some((url) => pdfModule.test(url))).toBe(true);
  expect(modules).toContain("/ocr/pdf.worker.min.mjs");
});

test("AC 6.6.66 clean, EXIF-tagged, low-contrast and sideways fixtures meet quality expectations", async ({ page }) => {
  test.setTimeout(150_000);
  await stubApi(page);
  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  const picker = page.locator("#study-guide-photos");
  const review = page.getByRole("textbox", { name: /recognized text/i });

  for (const name of ["clean.png", "exif-rotated.jpg"] as const) {
    await picker.setInputFiles(await ocrFile(name));
    await expect(review).toHaveValue(cleanScanSample, { timeout: 75_000 });
    await expect(review).toBeFocused();
    expect(goldenWordAccuracy(await review.inputValue()), name).toBeGreaterThanOrEqual(0.9);
  }

  for (const name of ["low-contrast.png", "sideways.jpg"] as const) {
    await picker.setInputFiles(await ocrFile(name));
    const uncertain = page.getByText("Some words may be wrong. Check the text before you continue.");
    const unresolved = page.getByRole("button", { name: /continue without page 1/i });
    await expect(uncertain.or(unresolved)).toBeVisible({ timeout: 75_000 });
    if (await uncertain.isVisible()) expect((await review.inputValue()).trim()).not.toBe("");
  }
});

test("AC 6.6.64 quota is unchanged after browser recognition and no generation endpoint is called", async ({ page, request, context }, testInfo) => {
  test.setTimeout(100_000);
  const configPath = "/api/study-guides/documents/config";
  const auth = { Authorization: "DevTest ci-user" };
  const before = await request.get(configPath, { headers: auth });
  expect(before.status()).toBe(200);
  const beforeBody = await before.json();
  expect(beforeBody.quota).toMatchObject({ dailyUsed: expect.any(Number), monthlyUsed: expect.any(Number) });
  // The disposable API stack has no vendor keys. Show the input without enabling paid generation.
  await page.route("**" + configPath, (route) => route.fulfill({ json: { ...beforeBody, enabled: true } }));
  await page.goto("/create/notes");
  const mutations: string[] = [];
  context.on("request", (outgoing) => {
    const url = new URL(outgoing.url());
    if (url.pathname.startsWith("/api/study-guides/documents") && outgoing.method() !== "GET") {
      mutations.push(outgoing.method() + " " + url.pathname);
    }
  });
  await page.getByRole("tab", { name: "Photos or scan" }).click();
  await page.locator("#study-guide-photos").setInputFiles(await ocrFile("clean.png"));
  await expect(page.getByRole("textbox", { name: /recognized text/i })).toHaveValue(cleanScanSample, { timeout: 75_000 });

  const after = await request.get(configPath, { headers: auth });
  expect(after.status()).toBe(200);
  const afterBody = await after.json();
  expect(afterBody.quota).toEqual(beforeBody.quota);
  expect(mutations).toEqual([]);
  await testInfo.attach("quota API before and after OCR", {
    body: JSON.stringify({
      environment: "Development stack with disposable PostgreSQL",
      request: "GET " + configPath,
      before: { status: before.status(), body: beforeBody },
      after: { status: after.status(), body: afterBody },
      studyGuideMutationRequests: mutations,
    }, null, 2),
    contentType: "application/json",
  });
});

test("AC 6.6.65 Upload file accepts selectable text PDFs and the server still rejects scans", async ({ page, request }) => {
  const configPath = "/api/study-guides/documents/config";
  const configResponse = await request.get(configPath, { headers: { Authorization: "DevTest ci-user" } });
  expect(configResponse.ok()).toBe(true);
  const realConfig = await configResponse.json();
  await page.route("**" + configPath, (route) => route.fulfill({ json: { ...realConfig, enabled: true } }));
  await page.goto("/create/notes");
  await chooseRealTopic(page);
  const fileInput = page.locator("input[type=file]").first();
  await fileInput.setInputFiles(await ocrFile("scanned.pdf"));
  const rejectedPromise = waitForDocumentCreate(page);
  await page.getByRole("button", { name: "Choose sections and review first" }).click();
  const rejected = await rejectedPromise;
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toMatchObject({ title: "StudyGuideDocument.Scanned" });
  await expect(page.getByRole("alert").filter({ hasText: "This looks like a scan" })).toBeVisible();

  await fileInput.setInputFiles({
    name: "selectable-notes.pdf",
    mimeType: "application/pdf",
    buffer: buildTextPdf("River currents carry fine sediment downstream. Water slows when it enters a lake."),
  });
  const createdPromise = waitForDocumentCreate(page);
  await page.getByRole("button", { name: "Choose sections and review first" }).click();
  const created = await createdPromise;
  expect([200, 201]).toContain(created.status());
  const document = await created.json();
  expect(document.sections.length).toBeGreaterThan(0);
  await expect(page).toHaveURL(new RegExp("/study-guides/documents/" + document.id));
});

test("AC 6.6.65 Paste text creates sections through the existing document endpoint", async ({ page, request }) => {
  const configPath = "/api/study-guides/documents/config";
  const configResponse = await request.get(configPath, { headers: { Authorization: "DevTest ci-user" } });
  expect(configResponse.ok()).toBe(true);
  const realConfig = await configResponse.json();
  await page.route("**" + configPath, (route) => route.fulfill({ json: { ...realConfig, enabled: true } }));
  await page.goto("/create/notes");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByRole("textbox", { name: /study guide text/i }).fill("Wetlands reduce flooding by slowing the movement of rainwater. Marsh plants provide shelter for many species.");
  await chooseRealTopic(page);
  const createdPromise = waitForDocumentCreate(page);
  await page.getByRole("button", { name: "Choose sections and review first" }).click();
  const created = await createdPromise;
  expect([200, 201]).toContain(created.status());
  const document = await created.json();
  expect(document.sections.length).toBeGreaterThan(0);
  expect(created.request().postData()).toContain('name="text"');
  expect(created.request().postData()).not.toContain('name="file"');
  await expect(page).toHaveURL(new RegExp("/study-guides/documents/" + document.id));
});

async function chooseRealTopic(page: Page): Promise<void> {
  await page.getByText("Browse all topics").click();
  await page.getByLabel("Category *").selectOption("exams");
  await page.getByLabel("Primary topic (rank 1) *").selectOption("aws");
  await page.getByLabel("Subtopic (rank 2) *").selectOption("saa-c03");
}

function waitForDocumentCreate(page: Page) {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/study-guides/documents" && response.request().method() === "POST"
  );
}

async function checkOcrLayout(page: Page): Promise<void> {
  const panel = page.getByRole("tabpanel");
  const controls = await panel.locator("label:has(input[type=file]), button, textarea").all();
  const tabs = await page.getByRole("tab").all();
  for (const control of [...tabs, ...controls]) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

for (const [layout, width] of [["mobile", 375], ["desktop", 1280]] as const) {
  test.describe(layout, () => {
    test("AC 6.6.56 and AC 6.6.58 accessible OCR states keep values and cancellation stops after the active page", async ({ page, context }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        const decode = window.createImageBitmap;
        let first = true;
        window.createImageBitmap = async (image, ...args: [ImageBitmapOptions?]) => {
          if (first) {
            first = false;
            await new Promise<void>((resolve) => window.addEventListener("test-release-first-decode", () => resolve(), { once: true }));
          }
          return decode(image, ...args);
        };
      });
      await stubApi(page);
      let writes = 0;
      context.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/study-guides/documents") && request.method() !== "GET") writes += 1;
      });
      await page.goto("/create/notes");
      await page.getByRole("button", { name: /more options/i }).click();
      await page.getByLabel(/^title/i).fill("My study notes");
      const tab = page.getByRole("tab", { name: "Photos or scan" });
      await tab.click();
      const picker = page.getByLabel("Choose files");
      const camera = page.getByLabel("Take photo");
      const review = page.getByRole("textbox", { name: /recognized text/i });
      const submit = page.getByRole("button", { name: "Make a quiz" });
      const capture = async (state: string) => {
        await checkOcrLayout(page);
        await page.screenshot({ path: testInfo.outputPath(layout + "-" + state + ".png"), fullPage: true });
      };

      await expect(camera).toHaveAttribute("capture", "environment");
      expect(await camera.getAttribute("multiple")).toBeNull();
      await capture("empty");

      await picker.setInputFiles(await ocrFile("scanned.pdf"));
      await expect(page.getByRole("button", { name: "Read 1 page" })).toBeVisible();
      await expect(page.getByRole("listitem", { name: "Page 1" })).toContainText("Queued");
      await capture("selected");

      await picker.setInputFiles([
        await ocrFile("clean.png"),
        { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("invalid PNG image") },
      ]);
      await expect(page.getByText("Reading page 1 of 2")).toBeVisible();
      const progress = page.getByRole("progressbar", { name: /pages read/i });
      await expect(progress).toHaveAttribute("aria-valuetext", "Reading page 1 of 2");
      await expect(progress).toHaveAttribute("aria-valuemax", "2");
      await expect(page.getByRole("listitem", { name: "Page 1" })).toContainText("Reading");
      await expect(page.getByRole("listitem", { name: "Page 2" })).toContainText("Queued");
      await expect(submit).toBeDisabled();
      await capture("reading");

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByText("Cancelling after this page…")).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("test-release-first-decode")));
      await expect(page.getByRole("button", { name: "Resume reading" })).toBeVisible({ timeout: 75_000 });
      await expect(page.getByRole("listitem", { name: "Page 1" })).toContainText("Done");
      await expect(page.getByRole("listitem", { name: "Page 2" })).toContainText("Queued");
      await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Page 1 done." })).toHaveCount(1);
      await expect(review).toHaveValue(cleanScanSample);
      await expect(submit).toBeDisabled();
      await page.getByRole("button", { name: "Resume reading" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Couldn't read page 2." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry page 2" })).toBeVisible();
      await expect(submit).toBeDisabled();
      await expect(page.getByLabel(/^title/i)).toHaveValue("My study notes");
      await capture("failed");
      await page.getByRole("button", { name: "Continue without page 2" }).click();
      await expect(review).toBeFocused();
      await expect(review).toHaveValue(cleanScanSample);
      await capture("review");

      await picker.setInputFiles({
        name: "oversized.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(config.maxFileBytes + 1),
      });
      await expect(page.getByRole("alert").filter({ hasText: /pdf.*(?:over|limit|larger|size)/i })).toBeVisible();
      await expect(review).toHaveValue(cleanScanSample);
      await capture("over-limit");
      expect(writes).toBe(0);

      const unsupported = await context.newPage();
      await unsupported.setViewportSize({ width, height: 900 });
      await unsupported.addInitScript(() => Object.defineProperty(window, "createImageBitmap", { value: undefined, configurable: true }));
      await stubApi(unsupported);
      await unsupported.goto("/create/notes");
      await unsupported.getByRole("tab", { name: "Photos or scan" }).click();
      await expect(unsupported.getByRole("alert").filter({ hasText: "Photo reading isn't supported in this browser. Use Upload file or Paste text." })).toBeVisible();
      await expect(unsupported.getByLabel("Choose files")).toHaveCount(0);
      await checkOcrLayout(unsupported);
      await unsupported.screenshot({ path: testInfo.outputPath(layout + "-unsupported.png"), fullPage: true });
      await unsupported.close();
    });
  });
}

test("AC 6.6.62 submit errors preserve reviewed OCR text and form fields", async ({ page }) => {
  await stubApi(page);
  await page.route("**/api/study-guides/documents/quick", (route) => route.fulfill({
    status: 400,
    json: { title: "StudyGuideDocument.InvalidNavigationPath", detail: "Choose a valid topic." },
  }));
  await page.goto("/create/notes");
  const { review } = await recognizePhoto(page);
  await chooseTopic(page);
  await page.getByRole("button", { name: "Make a quiz" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a valid topic." })).toBeFocused();
  await expect(review).toHaveValue("Edited photosynthesis notes");
  await expect(page.getByLabel(/^title/i)).toHaveValue("Photo notes");
  await expect(page.getByLabel(/^keywords/i)).toHaveValue("photosynthesis");
  await expect(page.getByLabel("Subtopic (rank 2) *")).toHaveValue("plants");
});
