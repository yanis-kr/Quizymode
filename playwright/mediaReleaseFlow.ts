/**
 * Media release checklist (AC 3.29, #638): one uploaded picture taken through its whole life.
 * upload -> private item -> pending review -> approved -> shared link -> withdrawn -> deleted.
 * The picture review matrix (AC 3.29.11 to 3.29.16, #891) reuses these steps for rejected, replaced, stale-decision,
 * edited and removed pictures (playwright/prod-verify/picture-review-matrix.write.spec.ts, playwright/e2e-ci/picture-review-matrix.spec.ts).
 *
 * The same steps run in two places:
 *   - playwright/e2e-ci/media-release.spec.ts        Development stack, DevTest identities (every PR)
 *   - playwright/prod-verify/media-release.write.spec.ts   production, the test user and the test admin (started by hand)
 *
 * Rules: every row it writes belongs to the calling test account, the item is private, the collection is link-only
 * (never listed in Discover), and `cleanup` deletes both. Request errors are re-thrown without their call log,
 * because Playwright's call log prints request headers and the Authorization header is a bearer token on production.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Who a request is made as. `authorization` undefined means a signed-out visitor. */
export interface Identity {
  request: APIRequestContext;
  apiBase: string;
  authorization?: string;
}

export interface ApiResult {
  status: number;
  contentType: string;
  json: any;
  bytes: number;
}

const SAMPLE_PICTURE = path.resolve(process.cwd(), ".claude/test-assets/sample-picture.png");
/** Media:MaxOutputSide and Media:MaxOutputBytes (AC 3.24): every stored picture is a WebP within these bounds. */
export const MAX_OUTPUT_SIDE = 1280;
export const MAX_OUTPUT_BYTES = 100 * 1024;

function redact(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*)\S+(\s+\S+)?/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, "[redacted]");
}

interface CallOptions {
  json?: unknown;
  multipart?: Record<string, { name: string; mimeType: string; buffer: Buffer }>;
  headers?: Record<string, string>;
}

/** One API call as `who`. Never throws with request headers in the message. */
export async function call(who: Identity, method: string, route: string, options: CallOptions = {}): Promise<ApiResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (who.authorization) headers.Authorization = who.authorization;
  try {
    const response = await who.request.fetch(`${who.apiBase}${route}`, {
      method,
      headers,
      data: options.json,
      multipart: options.multipart,
      maxRedirects: 0,
      timeout: 30_000,
      ignoreHTTPSErrors: true,
    });
    const contentType = response.headers()["content-type"] ?? "";
    const body = await response.body();
    let json: any = null;
    if (contentType.includes("json") && body.length > 0) {
      try {
        json = JSON.parse(body.toString("utf8"));
      } catch {
        json = null;
      }
    }
    return { status: response.status(), contentType, json, bytes: body.length };
  } catch (error) {
    throw new Error(`${method} ${route} failed: ${redact(String((error as Error).message).split("\n")[0])}`);
  }
}

/**
 * Opens the home page and reads the Authorization header the app itself sends, so the checklist calls the API exactly
 * as that signed-in browser does (a Cognito bearer on production, the DevTest identity in Development).
 */
export async function identityFromPage(page: Page): Promise<Identity> {
  const seen = page.waitForRequest((request) => {
    const authorization = request.headers()["authorization"];
    return !!authorization && (request.resourceType() === "xhr" || request.resourceType() === "fetch");
  }, { timeout: 30_000 });
  await page.goto("/", { timeout: 30_000 });
  const request = await seen;
  const apiUrl = new URL(request.url());
  const pageUrl = new URL(page.url());
  const apiBase = apiUrl.origin === pageUrl.origin ? `${apiUrl.origin}/api` : apiUrl.origin;
  return { request: page.request, apiBase, authorization: request.headers()["authorization"] };
}

export function anonymous(like: Identity): Identity {
  return { request: like.request, apiBase: like.apiBase };
}

function crcChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
  return out;
}

/** A 1600 x 1000 PNG test card, larger than the output bound so the upload has to be resized. Unique per run. */
export function generatedPicture(): Buffer {
  const width = 1600;
  const height = 1000;
  const seed = Math.floor(Math.random() * 200);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const band = Math.floor(x / 200);
      const at = row + 1 + x * 3;
      raw[at] = (band * 36 + seed) % 256;
      raw[at + 1] = Math.floor((y / height) * 255);
      raw[at + 2] = band % 2 === 0 ? 200 : 60;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    crcChunk("IHDR", header),
    crcChunk("IDAT", zlib.deflateSync(raw)),
    crcChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The local sample picture when it exists (developer machines), otherwise a generated test card (CI runners). */
export function testPicture(): Buffer {
  return fs.existsSync(SAMPLE_PICTURE) ? fs.readFileSync(SAMPLE_PICTURE) : generatedPicture();
}

export interface ChecklistData {
  runId: string;
  altText: string;
  question: string;
  assetId?: string;
  itemId?: string;
  collectionId?: string;
  revision?: number;
  /** The second upload of the picture review matrix (AC 3.29.12). */
  replacementAssetId?: string;
}

export function newChecklistData(): ChecklistData {
  const runId = `${Date.now().toString(36)}`;
  return {
    runId,
    altText: `Release checklist test card ${runId}`,
    question: `Release checklist ${runId}: which test card is shown? (automated check, safe to delete)`,
  };
}

const picturePath = (itemId: string, slot = "question") => `/items/${itemId}/images/${slot}`;

/** AC 3.29.1: the upload is stored as a WebP within the output bounds, whatever was sent. */
export async function uploadPicture(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("upload a test picture", async () => {
    const result = await call(owner, "POST", "/media/images", {
      multipart: { file: { name: "picture", mimeType: "image/png", buffer: testPicture() } },
      headers: { "Idempotency-Key": `checklist-${data.runId}` },
    });
    expect(result.status, `upload status (${result.json?.title ?? ""})`).toBeLessThan(300);
    expect(result.json.state).toBe("Ready");
    expect(result.json.format).toBe("webp");
    expect(Math.max(result.json.width, result.json.height)).toBeLessThanOrEqual(MAX_OUTPUT_SIDE);
    expect(result.json.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    data.assetId = result.json.id;
  });
}

/** The text fields of the checklist item, shared by POST /items and PUT /items/{id}. */
function itemFields(data: ChecklistData) {
  return {
    category: "exams",
    navigationKeyword1: "general",
    navigationKeyword2: "mixed",
    isPrivate: true,
    question: data.question,
    correctAnswer: "The striped test card",
    incorrectAnswers: ["A photograph", "A map"],
    explanation: "Created by the media release checklist. It is deleted when the run ends.",
  };
}

/** AC 3.29.2: an item with an uploaded picture starts private and waiting for review. */
export async function createPrivateItem(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("create a private item with the picture", async () => {
    const result = await call(owner, "POST", "/items", {
      json: { ...itemFields(data), questionImage: { assetId: data.assetId, altText: data.altText } },
    });
    expect(result.status, `create item status (${result.json?.title ?? JSON.stringify(result.json)?.slice(0, 300)})`).toBeLessThan(300);
    expect(result.json.isPrivate).toBe(true);
    expect(result.json.imageReview?.state).toBe("PendingReview");
    data.itemId = result.json.id;
    data.revision = result.json.imageReview.revision;
  });
}

export async function expectPicture(who: Identity, route: string, expected: 200 | 404, label: string): Promise<void> {
  const result = await call(who, "GET", route);
  // CloudFront delivery answers 302 to a short-lived signed URL; proxy delivery answers 200 with the bytes.
  const status = result.status === 302 ? 200 : result.status;
  expect(status, label).toBe(expected);
  if (result.status === 200) {
    expect(result.contentType, `${label} content type`).toContain("image/webp");
    expect(result.bytes, `${label} size`).toBeGreaterThan(0);
  }
}

/** AC 3.29.3: while the picture waits for review only its creator and admins can read it. */
export async function checkPendingAccess(owner: Identity, admin: Identity, data: ChecklistData): Promise<void> {
  await test.step("pending picture: creator and admin can read it, a signed-out visitor cannot", async () => {
    const route = picturePath(data.itemId!);
    await expectPicture(owner, route, 200, "creator reads the pending picture");
    await expectPicture(admin, route, 200, "admin reads the pending picture");
    await expectPicture(anonymous(owner), route, 404, "signed-out visitor is refused the pending picture");
    const item = await call(anonymous(owner), "GET", `/items/${data.itemId}`);
    expect(item.status, "signed-out visitor is refused the private item").toBe(404);
  });
}

/** AC 3.29.5: a non-admin cannot approve; an admin can, and the item then reports Approved. */
export async function approvePicture(owner: Identity, admin: Identity, data: ChecklistData): Promise<void> {
  await test.step("admin approves the picture", async () => {
    const body = { decision: "approve", expectedRevision: data.revision };
    const refused = await call(owner, "PUT", `/admin/items/${data.itemId}/image-review`, { json: body });
    expect(refused.status, "a regular user cannot approve a picture").toBe(403);
    const approved = await call(admin, "PUT", `/admin/items/${data.itemId}/image-review`, { json: body });
    expect(approved.status, `approve status (${approved.json?.title ?? ""})`).toBe(200);
    expect(approved.json.imageReview.state).toBe("Approved");
    const item = await call(owner, "GET", `/items/${data.itemId}`);
    expect(item.json.imageReview?.state).toBe("Approved");
  });
}

const sharedPicturePath = (data: ChecklistData) => `/collections/${data.collectionId}/items/${data.itemId}/images/question`;

/**
 * AC 3.29.6, before approval: the creator puts the private item in a link-only collection of their own. A visitor can
 * open the collection, but the picture is still waiting for review, so the shared link does not serve it.
 */
export async function shareThroughLink(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("shared link: a pending picture is not served to visitors", async () => {
    const collection = await call(owner, "POST", "/collections", {
      json: { name: `Release checklist ${data.runId}`, description: "Automated check, safe to delete.", isPublic: true, isDiscoverable: false },
    });
    expect(collection.status, "create link-only collection").toBeLessThan(300);
    data.collectionId = collection.json.id;
    const added = await call(owner, "POST", `/collections/${data.collectionId}/items`, { json: { itemId: data.itemId } });
    expect(added.status, "add the item to the collection").toBeLessThan(300);

    const visitor = anonymous(owner);
    expect((await call(visitor, "GET", `/collections/${data.collectionId}`)).status, "visitor opens the shared link").toBe(200);
    await expectPicture(owner, sharedPicturePath(data), 200, "creator reads the pending picture through the shared link");
    await expectPicture(visitor, sharedPicturePath(data), 404, "visitor is refused the pending picture through the shared link");
  });
}

/**
 * AC 3.29.6, after approval: the shared link now serves the picture to a visitor (the owner shared their own private
 * question through their own collection, AC 1.5.1), while the item route still refuses it because the item is private.
 */
export async function checkSharedLinkAfterApproval(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("shared link: an approved picture is served through the link only", async () => {
    const visitor = anonymous(owner);
    await expectPicture(visitor, sharedPicturePath(data), 200, "visitor reads the approved picture through the shared link");
    await expectPicture(visitor, picturePath(data.itemId!), 404, "visitor is refused the picture of a private item outside the shared link");
  });
}

/** AC 3.29.7: an admin withdraws the picture and it stops being served to everyone, its creator included. */
export async function withdrawPicture(owner: Identity, admin: Identity, data: ChecklistData): Promise<void> {
  await test.step("admin withdraws the picture everywhere", async () => {
    const current = await call(owner, "GET", `/items/${data.itemId}`);
    const body = { itemId: data.itemId, expectedRevision: current.json.imageReview.revision, category: "other" };
    const refused = await call(owner, "POST", `/admin/media/${data.assetId}/withdraw`, { json: body });
    expect(refused.status, "a regular user cannot withdraw a picture").toBe(403);
    const withdrawn = await call(admin, "POST", `/admin/media/${data.assetId}/withdraw`, { json: body });
    expect(withdrawn.status, `withdraw status (${withdrawn.json?.title ?? ""})`).toBe(200);
    expect(withdrawn.json.state).toBe("Withdrawn");

    const route = picturePath(data.itemId!);
    await expectPicture(owner, route, 404, "creator no longer gets the withdrawn picture");
    await expectPicture(admin, route, 404, "admin no longer gets the withdrawn picture");
    await expectPicture(anonymous(owner), route, 404, "visitor no longer gets the withdrawn picture");
    if (data.collectionId) {
      await expectPicture(anonymous(owner), sharedPicturePath(data), 404, "visitor no longer gets the withdrawn picture through the shared link");
      await expectPicture(owner, sharedPicturePath(data), 404, "creator no longer gets the withdrawn picture through the shared link");
    }
    const item = await call(owner, "GET", `/items/${data.itemId}`);
    expect(item.json.imageReview?.state).toBe("Withdrawn");
  });
}

/** AC 3.29.8: removes everything the run created. Safe to call when a step failed half way. */
export async function cleanup(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("delete the test collection and the test item", async () => {
    if (data.collectionId) {
      const removed = await call(owner, "DELETE", `/collections/${data.collectionId}`);
      expect.soft(removed.status, "delete the test collection").toBeLessThan(300);
    }
    if (data.itemId) {
      const removed = await call(owner, "DELETE", `/items/${data.itemId}`);
      expect.soft(removed.status, "delete the test item").toBeLessThan(300);
      const gone = await call(owner, "GET", `/items/${data.itemId}`);
      expect.soft(gone.status, "the test item is gone").toBe(404);
    }
  });
}

/** Saves a full-page screenshot into the report under a readable name. */
export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

/** The picture is on screen, decoded, and fits inside the viewport width (no sideways scrolling). */
export async function expectPictureOnScreen(page: Page, altText: string): Promise<void> {
  const picture = page.getByRole("img", { name: altText }).first();
  await expect(picture).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => picture.evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const box = await picture.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport ? box.x + box.width : 0, "picture fits the viewport width").toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
}

export const MOBILE_VIEWPORT = { width: 390, height: 844 };
export const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

/** AC 3.29.4: the creator studies and edits the item on a desktop and on a phone-sized screen. */
export async function checkOwnerScreens(page: Page, testInfo: TestInfo, data: ChecklistData): Promise<void> {
  for (const [label, viewport] of [["desktop", DESKTOP_VIEWPORT], ["mobile", MOBILE_VIEWPORT]] as const) {
    await test.step(`creator sees the picture while studying (${label})`, async () => {
      await page.setViewportSize(viewport);
      await page.goto(`/explore/item/${data.itemId}`, { timeout: 30_000 });
      await expectPictureOnScreen(page, data.altText);
      await capture(page, testInfo, `study-${label}`);
    });
    await test.step(`creator sees the picture in the editor (${label})`, async () => {
      await page.goto(`/items/${data.itemId}/edit`, { timeout: 30_000 });
      await expect(page.getByRole("group", { name: /Question picture/ })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("img", { name: "Optimized picture preview" }).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel(/Short description/).first()).toHaveValue(data.altText);
      await capture(page, testInfo, `editor-${label}`);
    });
  }
  await page.setViewportSize(DESKTOP_VIEWPORT);
}

/** After withdrawal the study page no longer shows the picture. */
export async function checkOwnerScreenAfterWithdrawal(page: Page, testInfo: TestInfo, data: ChecklistData): Promise<void> {
  await test.step("creator's study page no longer shows the withdrawn picture", async () => {
    await page.goto(`/explore/item/${data.itemId}`, { timeout: 30_000 });
    await expect(page.getByText(data.question).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    const picture = page.getByRole("img", { name: data.altText });
    const decoded = (await picture.count()) === 0 ? 0 : await picture.first().evaluate((img) => (img as HTMLImageElement).naturalWidth ?? 0);
    expect(decoded, "no decoded picture after withdrawal").toBe(0);
    await capture(page, testInfo, "study-after-withdrawal");
  });
}

// ---- Picture review matrix (AC 3.29.11 to 3.29.16, #891): rejected, replaced picture, stale decision, edit, removal ----

/** The owner's current picture review of the item. */
async function currentReview(owner: Identity, data: ChecklistData): Promise<{ state: string; revision: number; reason?: string } | null> {
  const item = await call(owner, "GET", `/items/${data.itemId}`);
  expect(item.status, "creator reads the item").toBe(200);
  return item.json.imageReview ?? null;
}

/** PUT /items/{id} as the owner with the checklist fields plus `changes`; returns the saved picture review. */
async function saveItem(owner: Identity, data: ChecklistData, changes: Record<string, unknown>, label: string) {
  const result = await call(owner, "PUT", `/items/${data.itemId}`, {
    json: { ...itemFields(data), expectedImageRevision: data.revision, ...changes },
  });
  expect(result.status, `${label} status (${result.json?.title ?? JSON.stringify(result.json)?.slice(0, 300)})`).toBeLessThan(300);
  return result.json.imageReview ?? null;
}

/**
 * AC 3.29.11: an admin rejects the pending picture with a reason. The creator sees Rejected and the reason, the admin
 * still reads the picture on the item route, a signed-out visitor gets 404 on both routes, and the admin gets 404 on the
 * collection route because the admin did not create the item.
 */
export async function rejectPicture(owner: Identity, admin: Identity, data: ChecklistData, reason: string): Promise<void> {
  await test.step("admin rejects the picture with a reason", async () => {
    const rejected = await call(admin, "PUT", `/admin/items/${data.itemId}/image-review`, {
      json: { decision: "reject", expectedRevision: data.revision, reason },
    });
    expect(rejected.status, `reject status (${rejected.json?.title ?? ""})`).toBe(200);
    expect(rejected.json.imageReview.state).toBe("Rejected");

    const review = await currentReview(owner, data);
    expect(review?.state, "creator sees Rejected").toBe("Rejected");
    expect(review?.reason, "creator sees the rejection reason").toBe(reason);

    const visitor = anonymous(owner);
    await expectPicture(admin, picturePath(data.itemId!), 200, "admin reads the rejected picture on the item route");
    await expectPicture(visitor, picturePath(data.itemId!), 404, "visitor is refused the rejected picture on the item route");
    await expectPicture(visitor, sharedPicturePath(data), 404, "visitor is refused the rejected picture through the shared link");
    await expectPicture(admin, sharedPicturePath(data), 404, "admin, not the creator, is refused the rejected picture through the shared link");
  });
}

/** AC 3.29.12: the owner uploads a second picture and puts it on the item; it waits for review at the next revision. */
export async function replacePicture(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("owner replaces the picture with a new upload", async () => {
    const upload = await call(owner, "POST", "/media/images", {
      multipart: { file: { name: "picture", mimeType: "image/png", buffer: generatedPicture() } },
      headers: { "Idempotency-Key": `checklist-${data.runId}-replacement` },
    });
    expect(upload.status, `second upload status (${upload.json?.title ?? ""})`).toBeLessThan(300);
    expect(upload.json.id, "the second upload is a new asset").not.toBe(data.assetId);
    data.replacementAssetId = upload.json.id;

    const previous = data.revision!;
    const review = await saveItem(owner, data, { questionImage: { assetId: upload.json.id, altText: data.altText } }, "replace picture");
    expect(review?.state, "a replaced picture waits for review").toBe("PendingReview");
    expect(review?.revision, "a replaced picture is the next revision").toBe(previous + 1);
    data.revision = review.revision;

    await expectPicture(anonymous(owner), sharedPicturePath(data), 404, "visitor is refused the replaced picture through the shared link");
  });
}

/**
 * AC 3.29.13: a decision naming an old revision is refused with 409 Item.ImageReviewStale and the current revision;
 * approving the current revision works, and the visitor's picture request is bound to that revision.
 */
export async function staleDecision(owner: Identity, admin: Identity, data: ChecklistData, oldRevision: number): Promise<void> {
  await test.step("a decision for the old revision is stale; the current one is approved", async () => {
    const stale = await call(admin, "PUT", `/admin/items/${data.itemId}/image-review`, {
      json: { decision: "approve", expectedRevision: oldRevision },
    });
    expect(stale.status, "a decision for the old revision is refused").toBe(409);
    expect(stale.json?.title).toBe("Item.ImageReviewStale");
    expect(stale.json?.currentRevision, "the refusal names the current revision").toBe(data.revision);

    const approved = await call(admin, "PUT", `/admin/items/${data.itemId}/image-review`, {
      json: { decision: "approve", expectedRevision: data.revision },
    });
    expect(approved.status, `approve status (${approved.json?.title ?? ""})`).toBe(200);
    expect(approved.json.imageReview.state).toBe("Approved");

    const visitor = anonymous(owner);
    await expectPicture(visitor, `${sharedPicturePath(data)}?expectedRevision=${data.revision}`, 200, "visitor reads the approved picture at the current revision");
    await expectPicture(visitor, `${sharedPicturePath(data)}?expectedRevision=${oldRevision}`, 404, "visitor is refused the picture at the old revision");
  });
}

/** AC 3.29.14: editing the question text sends an approved picture back to review and hides it from the visitor. */
export async function editQuestion(owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("owner edits the question text", async () => {
    const previous = data.revision!;
    data.question = `${data.question} (edited)`;
    const review = await saveItem(owner, data, {}, "edit question");
    expect(review?.state, "an edited item waits for review again").toBe("PendingReview");
    expect(review?.revision).toBe(previous + 1);
    data.revision = review.revision;

    await expectPicture(anonymous(owner), sharedPicturePath(data), 404, "visitor is refused the picture after the edit");
  });
}

/**
 * AC 3.29.15: the owner removes the picture on the edit page. "Remove picture" asks through the browser's native confirm
 * dialog, which blocks the page until it is answered, so it is accepted here; saving then asks again in the page.
 */
export async function removePictureInEditor(page: Page, testInfo: TestInfo, owner: Identity, data: ChecklistData): Promise<void> {
  await test.step("owner removes the picture in the editor and saves", async () => {
    await page.goto(`/items/${data.itemId}/edit`, { timeout: 30_000 });
    const slot = page.getByRole("group", { name: /Question picture/ });
    await expect(slot.getByRole("button", { name: "Remove picture" })).toBeVisible({ timeout: 20_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await slot.getByRole("button", { name: "Remove picture" }).click();
    await expect(slot.getByLabel(/^Add picture/)).toBeAttached({ timeout: 10_000 });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Removing an uploaded picture is a relevant change, so the in-page confirmation of AC 3.25.11 opens.
    const confirm = page.getByRole("dialog", { name: /fresh picture review/ });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => (await currentReview(owner, data))?.state ?? null, { timeout: 20_000 }).toBeNull();

    await page.goto(`/items/${data.itemId}/edit`, { timeout: 30_000 });
    await expect(page.getByRole("group", { name: /Question picture/ }).getByLabel(/^Add picture/)).toBeAttached({ timeout: 20_000 });
    await capture(page, testInfo, "editor-after-picture-removed");
  });
}

/** AC 3.29.16: both uploads stay private and unreferenced (AC 3.27.7); their ids go into the report. */
export async function recordUploadedAssets(testInfo: TestInfo, data: ChecklistData): Promise<void> {
  const ids = [data.assetId, data.replacementAssetId].filter((id): id is string => !!id);
  testInfo.annotations.push({ type: "uploaded-assets", description: ids.join(", ") || "none" });
  await testInfo.attach("uploaded-assets", { body: JSON.stringify({ assetIds: ids }, null, 2), contentType: "application/json" });
}
