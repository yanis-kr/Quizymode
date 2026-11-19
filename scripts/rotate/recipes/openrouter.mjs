// OpenRouter API key. List page and "New key" form walked 2026-11-18 (form opened, nothing created). Reveal and delete are
// NOT walked yet: run `--only openrouter --apply` once with the owner watching. The "Default key" row is not Quizymode's and
// is never touched: only tails that belonged to the key named "Quizymode" are revoked.
import { captureSecret, httpCheck, runStamp } from "./_lib.mjs";

export async function create(page) {
  await page.goto("https://openrouter.ai/settings/keys");
  const row = page.locator("tr", { hasText: /Quizymode/ }).first();
  const oldTail = (await row.innerText()).match(/\(([0-9a-z]{3})\)/)?.[1] ?? "";
  await page.getByRole("button", { name: /^New key/i }).first().click();
  await page.getByPlaceholder(/Chatbot Key/i).fill(runStamp());
  await page.getByRole("button", { name: /^Create$/ }).click();
  const secret = await captureSecret(page, "sk-or-v1-[A-Za-z0-9]{20,}");
  await page.close();
  return { values: { secret }, oldRef: oldTail };
}

export const check = (values) => httpCheck("https://openrouter.ai/api/v1/auth/key", { Authorization: `Bearer ${values.secret}` });

export async function revoke(page, oldTail) {
  if (!oldTail) return;
  await page.goto("https://openrouter.ai/settings/keys");
  const row = page.locator("tr", { hasText: `(${oldTail})` }).first();
  await row.getByRole("button", { name: /row actions|more|actions/i }).first().click();
  await page.getByRole("menuitem", { name: /delete|revoke/i }).first().click();
  await page.getByRole("button", { name: /^(delete|revoke|confirm)/i }).last().click();
  await row.waitFor({ state: "detached", timeout: 15000 });
  await page.close();
}
