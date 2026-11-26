/**
 * Uploaded pictures inside a public collection (#403, AC 3.21.14) on the Development stack: DevTest identities,
 * file-system picture storage. Reuses the release checklist helpers (AC 3.29) for the upload, the private item, the
 * link-only public collection and the admin approval.
 */
import { test, expect } from "../fixtures";
import {
  anonymous,
  approvePicture,
  checkSharedLinkAfterApproval,
  cleanup,
  createPrivateItem,
  expectPictureOnScreen,
  identityFromPage,
  newChecklistData,
  shareThroughLink,
  uploadPicture,
  type Identity,
} from "../mediaReleaseFlow";

const ADMIN_AUTHORIZATION = "DevTest ci-admin admin";

test("AC 3.21.14 @e2e a signed-out visitor sees an uploaded picture inside a public collection in Quiz and Flashcards", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await identityFromPage(page);
  const admin: Identity = { ...owner, authorization: ADMIN_AUTHORIZATION };
  const data = newChecklistData();
  const slug = `release-checklist-${data.runId}`;

  try {
    // Product rule (AC 1.5.1, AC 1.16c.1, AC 3.25.5): a private item can only be a member of a collection owned by its own
    // creator, and every other viewer then reaches it, and its approved picture, through that public collection only.
    // The picture of a private item is never served through the item route to anyone but its creator and admins.
    await uploadPicture(owner, data);
    await createPrivateItem(owner, data);
    await shareThroughLink(owner, data);
    await approvePicture(owner, admin, data);
    // API: 200 image through the collection route, 404 through the direct item route, as a visitor with no identity.
    await checkSharedLinkAfterApproval(owner, data);
    const visitor = anonymous(owner);
    expect(visitor.authorization, "the visitor has no identity").toBeUndefined();

    // Browser: the dev web build always sends the DevTest identity, so a fresh context alone would still be signed in.
    // Drop the Authorization header from every API request the page makes: the page then behaves as a signed-out visitor.
    const apiOrigin = new URL(owner.apiBase).origin;
    const pictureRequests: { url: string; status: number }[] = [];
    const directItemRequests: string[] = [];
    await page.context().route(
      (url) => url.origin === apiOrigin,
      async (route) => {
        const headers = { ...route.request().headers() };
        delete headers["authorization"];
        await route.continue({ headers });
      },
    );
    page.on("request", (request) => {
      if (request.url().includes(`/items/${data.itemId}/images/`) && !request.url().includes("/collections/")) {
        directItemRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      if (response.url().includes(`/collections/${data.collectionId}/items/${data.itemId}/images/`)) {
        pictureRequests.push({ url: response.url(), status: response.status() });
      }
    });

    for (const [label, path] of [
      ["Quiz", `/quiz/collections/${data.collectionId}/${slug}`],
      ["Flashcards", `/explore/collections/${data.collectionId}/${slug}`],
    ] as const) {
      await test.step(`signed-out visitor opens the public collection in ${label}`, async () => {
        await page.goto(path, { timeout: 30_000 });
        await expect(page.getByText(data.question).first()).toBeVisible({ timeout: 30_000 });
        await expectPictureOnScreen(page, data.altText);
        await expect(page.getByText("Picture isn't available")).toHaveCount(0);

        if (label === "Quiz") {
          await expect(page.locator('[data-testid="question-image"][aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
          const option = page.locator('button[type="button"]').filter({ hasText: /^\s*A\./ }).first();
          await expect(option).toBeEnabled({ timeout: 20_000 });
          await option.click();
          const feedback = page.getByTestId("answer-feedback-card");
          await expect(feedback).toBeVisible({ timeout: 20_000 });
          await expect(feedback).toContainText(/Correct!|Not quite\./);
          await expect(page.getByText("Picture isn't available")).toHaveCount(0);
        }
      });
    }

    expect(pictureRequests.length, "the page requested the picture through the collection route").toBeGreaterThan(0);
    expect(pictureRequests.every((entry) => entry.status === 200 || entry.status === 302), "every collection picture request succeeded").toBe(true);
    expect(directItemRequests, "the page never used the direct item picture route").toEqual([]);
  } finally {
    await cleanup(owner, data);
  }
});
