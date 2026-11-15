/**
 * Picture display on the study page (#661, AC 3.30) on the Development stack: DevTest identities, file-system picture
 * storage. Reuses the release checklist helpers to put a real uploaded picture on a private item.
 */
import { test, expect } from "../fixtures";
import {
  MOBILE_VIEWPORT,
  cleanup,
  createPrivateItem,
  expectPictureOnScreen,
  identityFromPage,
  newChecklistData,
  uploadPicture,
  withdrawPicture,
  type Identity,
} from "../mediaReleaseFlow";

test("AC 3.30.1 @e2e at 390 px the Report picture link is fully visible and does not overlap the zoom button", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await identityFromPage(page);
  const data = newChecklistData();
  try {
    await uploadPicture(owner, data);
    await createPrivateItem(owner, data);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(`/explore/item/${data.itemId}`, { timeout: 30_000 });
    await expectPictureOnScreen(page, data.altText);

    const report = page.getByRole("button", { name: "Report picture" });
    const zoom = page.getByRole("button", { name: "Enlarge picture" });
    await expect(report).toBeVisible();
    await expect(zoom).toBeVisible();
    const reportBox = (await report.boundingBox())!;
    const zoomBox = (await zoom.boundingBox())!;
    expect(reportBox.x, "link starts inside the viewport").toBeGreaterThanOrEqual(0);
    expect(reportBox.x + reportBox.width, "link ends inside the viewport").toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    const overlaps =
      reportBox.x < zoomBox.x + zoomBox.width && zoomBox.x < reportBox.x + reportBox.width &&
      reportBox.y < zoomBox.y + zoomBox.height && zoomBox.y < reportBox.y + reportBox.height;
    expect(overlaps, "link and zoom button do not overlap").toBe(false);
    await expect(report).toHaveText("Report picture");
    expect(await report.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "link text is not clipped").toBe(true);
  } finally {
    await cleanup(owner, data);
  }
});

test("AC 3.30.3 @e2e after an admin withdraws the picture its creator sees a withdrawn message and no Retry", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await identityFromPage(page);
  const admin: Identity = { ...owner, authorization: "DevTest ci-admin admin" };
  const data = newChecklistData();
  try {
    await uploadPicture(owner, data);
    await createPrivateItem(owner, data);
    await withdrawPicture(owner, admin, data);
    await page.goto(`/explore/item/${data.itemId}`, { timeout: 30_000 });
    await expect(page.getByText("This picture was withdrawn")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Retry loading picture" })).toHaveCount(0);
  } finally {
    await cleanup(owner, data);
  }
});
