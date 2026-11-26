/**
 * Picture review matrix rehearsal (AC 3.29.11 to 3.29.16, #891) on the Development stack: DevTest identities, file-system
 * picture storage. The production run of the same steps is playwright/prod-verify/picture-review-matrix.write.spec.ts.
 */
import { test, expect } from "../fixtures";
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
  type Identity,
} from "../mediaReleaseFlow";

const ADMIN_AUTHORIZATION = "DevTest ci-admin admin";

test("AC 3.29.11, AC 3.29.12, AC 3.29.13, AC 3.29.14, AC 3.29.15, AC 3.29.16 @e2e a picture is rejected, replaced, decided at the right revision, re-reviewed after an edit and removed", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const owner = await identityFromPage(page);
  expect(owner.authorization).toBe("DevTest ci-user");
  const admin: Identity = { ...owner, authorization: ADMIN_AUTHORIZATION };
  const data = newChecklistData();

  try {
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
    await cleanup(owner, data);
    await recordUploadedAssets(testInfo, data);
  }
});
