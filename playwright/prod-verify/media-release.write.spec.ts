/**
 * Media release checklist on production (AC 3.29, #638). This spec WRITES to production, so it is not part of the
 * every-deploy `prod-verify` project. It runs only in the `prod-checklist` project, started by hand through the
 * "Prod release checklist" workflow.
 *
 * What it writes, all owned by the test user: one uploaded picture (1 of the 20 daily uploads), one private item,
 * one link-only collection (not listed in Discover). The test admin approves and then withdraws the picture.
 * The item and the collection are deleted at the end, also when a step fails.
 */
import fs from "fs";
import { INTERNAL_BROWSER_STORAGE_KEY } from "../fixtures";
import {
  approvePicture,
  capture,
  checkOwnerScreenAfterWithdrawal,
  checkOwnerScreens,
  checkPendingAccess,
  checkSharedLinkAfterApproval,
  cleanup,
  createPrivateItem,
  identityFromPage,
  newChecklistData,
  recordUploadedAssets,
  shareThroughLink,
  uploadPicture,
  withdrawPicture,
} from "../mediaReleaseFlow";
import { ROLE_STATE_FILES, asUser, expect } from "./roles";

asUser("AC 3.29.1, AC 3.29.2, AC 3.29.3, AC 3.29.4, AC 3.29.5, AC 3.29.6, AC 3.29.7, AC 3.29.8, AC 3.29.17 an uploaded picture goes from upload to review, approval, shared link, withdrawal and deletion on production", async ({ page, browser }, testInfo) => {
  asUser.setTimeout(300_000);
  asUser.skip(!fs.existsSync(ROLE_STATE_FILES.admin), "BLOCKED: no saved admin sign-in; set the admin test account variables");

  const adminContext = await browser.newContext({
    storageState: ROLE_STATE_FILES.admin,
    userAgent: testInfo.project.use.userAgent,
    viewport: { width: 1280, height: 900 },
  });
  await adminContext.addInitScript((key: string) => {
    try {
      window.localStorage.setItem(key, "true");
    } catch {
      // Storage can be unavailable on special pages such as about:blank.
    }
  }, INTERNAL_BROWSER_STORAGE_KEY);
  const adminPage = await adminContext.newPage();
  const data = newChecklistData();
  const owner = await identityFromPage(page);

  try {
    const admin = await identityFromPage(adminPage);
    expect(admin.authorization, "the admin and the user are different sign-ins").not.toBe(owner.authorization);

    await uploadPicture(owner, data);
    await createPrivateItem(owner, data);
    await checkPendingAccess(owner, admin, data);
    await checkOwnerScreens(page, testInfo, data);

    await asUser.step("admin sees the picture waiting on the Review Board", async () => {
      await adminPage.goto("/admin/review-board?tab=pictures", { timeout: 30_000 });
      await expect(adminPage.getByRole("tab", { name: /Pictures/ })).toBeVisible({ timeout: 20_000 });
      await expect(adminPage.getByText(data.question).first()).toBeVisible({ timeout: 20_000 });
      await capture(adminPage, testInfo, "admin-review-board-pictures");
    });

    await shareThroughLink(owner, data);
    await approvePicture(owner, admin, data);
    await checkSharedLinkAfterApproval(owner, data);
    await withdrawPicture(owner, admin, data);
    await checkOwnerScreenAfterWithdrawal(page, testInfo, data);
  } finally {
    // Each cleanup step runs even when the one before it throws.
    try {
      await cleanup(owner, data);
    } finally {
      try {
        await recordUploadedAssets(testInfo, data);
      } finally {
        await adminContext.close();
      }
    }
  }
});
