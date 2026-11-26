/**
 * Picture review matrix on production (AC 3.29.11 to 3.29.16, #891). This spec WRITES to production, so it runs only in
 * the `prod-checklist` project, started by hand through the "Prod release checklist" workflow.
 *
 * What it writes, all owned by the test user: two uploaded pictures (2 of the 20 daily uploads), one private item and
 * one link-only collection (not listed in Discover). The test admin rejects the first picture and approves the second.
 * The item and the collection are deleted at the end, also when a step fails; the two uploads stay private and
 * unreferenced (AC 3.27.7) and their ids are recorded in the report.
 */
import fs from "fs";
import { INTERNAL_BROWSER_STORAGE_KEY } from "../fixtures";
import {
  cleanup,
  createPrivateItem,
  editQuestion,
  identityFromPage,
  newChecklistData,
  recordUploadedAssets,
  rejectPicture,
  removePictureInEditor,
  replacePicture,
  shareThroughLink,
  staleDecision,
  uploadPicture,
} from "../mediaReleaseFlow";
import { ROLE_STATE_FILES, asUser, expect } from "./roles";

asUser("AC 3.29.11, AC 3.29.12, AC 3.29.13, AC 3.29.14, AC 3.29.15, AC 3.29.16 a picture is rejected, replaced, decided at the right revision, re-reviewed after an edit and removed on production", async ({ page, browser }, testInfo) => {
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
    await shareThroughLink(owner, data);
    const firstRevision = data.revision!;
    await rejectPicture(owner, admin, data, `Release checklist rejection ${data.runId}`);
    await replacePicture(owner, data);
    await staleDecision(owner, admin, data, firstRevision);
    await editQuestion(owner, data);
    await removePictureInEditor(page, testInfo, owner, data);
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
