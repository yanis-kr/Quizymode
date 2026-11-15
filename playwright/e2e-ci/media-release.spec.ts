/**
 * Media release checklist rehearsal (AC 3.29, #638) on the Development stack: DevTest identities, file-system picture
 * storage. The production run of the same steps is playwright/prod-verify/media-release.write.spec.ts.
 */
import { test, expect } from "../fixtures";
import {
  anonymous,
  approvePicture,
  call,
  checkOwnerScreenAfterWithdrawal,
  checkOwnerScreens,
  checkPendingAccess,
  checkSharedLinkAfterApproval,
  cleanup,
  createPrivateItem,
  expectPicture,
  identityFromPage,
  newChecklistData,
  shareThroughLink,
  testPicture,
  uploadPicture,
  withdrawPicture,
  type Identity,
} from "../mediaReleaseFlow";

const ADMIN_AUTHORIZATION = "DevTest ci-admin admin";

test("AC 3.29.1, AC 3.29.2, AC 3.29.3, AC 3.29.4, AC 3.29.5, AC 3.29.6, AC 3.29.7, AC 3.29.8 @e2e an uploaded picture goes from upload to review, approval, shared link, withdrawal and deletion", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const owner = await identityFromPage(page);
  expect(owner.authorization).toBe("DevTest ci-user");
  const admin: Identity = { ...owner, authorization: ADMIN_AUTHORIZATION };
  const data = newChecklistData();

  try {
    await uploadPicture(owner, data);
    await createPrivateItem(owner, data);
    await checkPendingAccess(owner, admin, data);
    await checkOwnerScreens(page, testInfo, data);
    await shareThroughLink(owner, data);
    await approvePicture(owner, admin, data);
    await checkSharedLinkAfterApproval(owner, data);
    await withdrawPicture(owner, admin, data);
    await checkOwnerScreenAfterWithdrawal(page, testInfo, data);
  } finally {
    await cleanup(owner, data);
  }
});

test("AC 3.29.9 @e2e a public item's picture reaches signed-out visitors and other users only after approval and never after withdrawal", async ({ page }) => {
  test.setTimeout(120_000);
  const user = await identityFromPage(page);
  const admin: Identity = { ...user, authorization: ADMIN_AUTHORIZATION };
  const visitor = anonymous(user);
  const runId = Date.now().toString(36);
  let itemId: string | undefined;

  try {
    const upload = await call(admin, "POST", "/media/images", {
      multipart: { file: { name: "picture", mimeType: "image/png", buffer: testPicture() } },
      headers: { "Idempotency-Key": `checklist-public-${runId}` },
    });
    expect(upload.status, `upload status (${upload.json?.title ?? ""})`).toBeLessThan(300);

    const itemBody = {
      category: "exams",
      navigationKeyword1: "general",
      navigationKeyword2: "mixed",
      question: `Release checklist public ${runId}: which test card is shown?`,
      correctAnswer: "The striped test card",
      incorrectAnswers: ["A photograph", "A map"],
      explanation: "Created by the media release checklist rehearsal.",
      questionImage: { assetId: upload.json.id, altText: `Release checklist public test card ${runId}` },
    };

    // An item cannot be published while its picture waits for review (AC 3.25).
    const refused = await call(admin, "POST", "/items", { json: { ...itemBody, isPrivate: false } });
    expect(refused.status, "publishing with a pending picture is refused").toBe(409);
    expect(refused.json?.title).toBe("Item.ImageReviewRequired");

    const item = await call(admin, "POST", "/items", { json: { ...itemBody, isPrivate: true } });
    expect(item.status, `create item status (${item.json?.title ?? JSON.stringify(item.json)?.slice(0, 300)})`).toBeLessThan(300);
    itemId = item.json.id;
    expect(item.json.imageReview?.state).toBe("PendingReview");
    const direct = `/items/${itemId}/images/question`;

    const approved = await call(admin, "PUT", `/admin/items/${itemId}/image-review`, {
      json: { decision: "approve", expectedRevision: item.json.imageReview.revision },
    });
    expect(approved.status, `approve status (${approved.json?.title ?? ""})`).toBe(200);
    await expectPicture(visitor, direct, 404, "visitor is refused the approved picture while the item is private");
    await expectPicture(user, direct, 404, "another signed-in user is refused the approved picture while the item is private");

    const published = await call(admin, "PUT", `/items/${itemId}/visibility`, { json: { isPrivate: false } });
    expect(published.status, `publish status (${published.json?.title ?? ""})`).toBeLessThan(300);
    await expectPicture(visitor, direct, 200, "visitor reads the approved picture of the public item");
    await expectPicture(user, direct, 200, "another signed-in user reads the approved picture of the public item");

    const withdrawn = await call(admin, "POST", `/admin/media/${upload.json.id}/withdraw`, {
      json: { itemId, expectedRevision: approved.json.imageReview.revision, category: "other" },
    });
    expect(withdrawn.status, `withdraw status (${withdrawn.json?.title ?? ""})`).toBe(200);
    await expectPicture(visitor, direct, 404, "visitor no longer gets the withdrawn picture");
    await expectPicture(user, direct, 404, "another signed-in user no longer gets the withdrawn picture");
  } finally {
    if (itemId) await call(admin, "DELETE", `/items/${itemId}`);
  }
});
