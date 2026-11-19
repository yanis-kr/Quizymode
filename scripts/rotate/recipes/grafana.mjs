// Grafana Cloud access policy token (policy "QuizyAP", scopes metrics/logs/traces write, org yaniskr). Policy card, its
// two existing tokens and the "Add token" dialog (name box "e.g. my-monitoring-token", expiry menu, "Create token") walked
// 2026-11-18, dialog cancelled. Reveal and delete are NOT walked yet: run `--only grafana-cloud --apply` once with the owner
// watching. The check is weak (token shape only, no read scope to test with), so after the redeploy confirm logs and traces
// still arrive in Grafana before resuming the run; the old tokens are deleted only in the revoke step.
import { captureSecret, runStamp } from "./_lib.mjs";

const POLICIES = "https://grafana.com/orgs/yaniskr/access-policies";

async function policyCard(page) {
  await page.goto(POLICIES);
  await page.waitForTimeout(5000);
  return page.locator("div", { hasText: "QuizyAP" }).filter({ has: page.getByText(/\d+ tokens?/) }).last();
}

export async function create(page) {
  let card = await policyCard(page);
  await card.getByText(/\d+ tokens?/).first().click();
  await page.waitForTimeout(2000);
  const text = await card.innerText();
  const oldNames = [...text.matchAll(/\|?\s*([A-Za-z0-9._-]+)\s*\n\s*Active\s*\n\s*Name:/g)].map((m) => m[1]);
  await card.getByRole("button", { name: /Add token/i }).first().click();
  await page.getByPlaceholder(/my-monitoring-token/i).fill(runStamp());
  await page.getByRole("button", { name: /^Create token$/i }).click();
  const secret = await captureSecret(page, "glc_[A-Za-z0-9_=+/-]{40,}", 45000);
  await page.close();
  return { values: { secret }, oldRef: oldNames.join(",") };
}

export const check = (values) => /^glc_[A-Za-z0-9_=+/-]{40,}$/.test(values.secret);

export async function revoke(page, oldRef) {
  const names = oldRef.split(",").filter(Boolean);
  if (!names.length) return;
  let card = await policyCard(page);
  await card.getByText(/\d+ tokens?/).first().click();
  await page.waitForTimeout(2000);
  for (const name of names) {
    card = await policyCard(page);
    await card.getByText(/\d+ tokens?/).first().click();
    const token = card.locator("div", { hasText: new RegExp(`^\\s*${name}\\b`) }).filter({ has: page.getByRole("button", { name: /^Delete$/ }) }).last();
    await token.getByRole("button", { name: /^Delete$/ }).click();
    await page.getByRole("button", { name: /^(delete|confirm|yes)/i }).last().click();
    await page.waitForTimeout(2000);
  }
  await page.close();
}
