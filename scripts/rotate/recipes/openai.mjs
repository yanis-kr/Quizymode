// OpenAI API key. List page and "Create new secret key" dialog walked 2026-11-18 (dialog opened and cancelled). Reveal and
// revoke are NOT walked yet: run `--only openai --apply` once with the owner watching. The old key is found by its tracking
// id (key_...), a non-secret identifier shown in the list.
import { captureSecret, copySecretViaClipboard, httpCheck, runStamp } from "./_lib.mjs";

export async function create(page) {
  await page.goto("https://platform.openai.com/api-keys");
  await page.waitForTimeout(3000);
  const ids = (await page.locator("body").innerText()).match(/key_[A-Za-z0-9]{12,}/g) ?? [];
  await page.getByRole("button", { name: /Create new secret key/i }).first().click();
  await page.getByPlaceholder(/My Test Key/i).fill(runStamp());
  // Expiration is required; "Never" keeps the key working like the one it replaces. Project and permissions stay at the defaults.
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/Select an expiration/i).first().click();
  await page.getByText(/^Never$/).first().click();
  await dialog.getByRole("button", { name: /^Create secret key$/i }).click();
  const shape = /^sk-(?:proj-)?[A-Za-z0-9_-]{30,}$/;
  // The reveal dialog usually holds the key in a read-only box; the copy button is the fallback.
  const secret = await captureSecret(page, "sk-(?:proj-)?[A-Za-z0-9_-]{30,}", 8000).catch(() => copySecretViaClipboard(page, { origin: "https://platform.openai.com", button: /^Copy/i, shape }));
  await page.close();
  return { values: { secret }, oldRef: [...new Set(ids)].join(",") };
}

export const check = (values) => httpCheck("https://api.openai.com/v1/models", { Authorization: `Bearer ${values.secret}` });

export async function revoke(page, oldRef) {
  await page.goto("https://platform.openai.com/api-keys");
  await page.waitForTimeout(3000);
  for (const id of oldRef.split(",").filter(Boolean)) {
    const row = page.locator("tr", { hasText: id }).first();
    await row.getByRole("button", { name: /^Revoke/i }).click();
    await page.getByRole("button", { name: /^Revoke/i }).last().click();
    await page.waitForTimeout(1500);
  }
  await page.close();
}
