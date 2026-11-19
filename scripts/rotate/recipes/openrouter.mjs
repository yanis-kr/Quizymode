// OpenRouter API key. List page, "New key" form (name, required expiration and credit limit) and the reveal dialog walked 2026-11-19: the
// key is shown once, masked, with "Copy key to clipboard". Delete is NOT walked yet: run `--only openrouter --apply` once with the owner watching. The "Default key" row is not Quizymode's and
// is never touched: only tails that belonged to the key named "Quizymode" are revoked.
import { copySecretViaClipboard, httpCheck, runStamp } from "./_lib.mjs";

export async function create(page) {
  await page.goto("https://openrouter.ai/settings/keys");
  const row = page.locator("tr", { hasText: /Quizymode/ }).first();
  const oldTail = (await row.innerText()).match(/\(([0-9a-z]{3})\)/)?.[1] ?? "";
  await page.getByRole("button", { name: /^New key/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Chatbot Key/i).fill(`${runStamp()}-${Date.now().toString(36).slice(-4)}`);
  // Expiration and credit limit are required. They mirror the existing key: 1 year, $5 a month.
  await dialog.getByText(/Select expiration/i).first().click();
  await page.getByText(/^1 year$/).first().click();
  await dialog.getByText(/Choose a credit limit/i).first().click();
  await page.getByText(/^Custom amount$/).first().click();
  await dialog.getByPlaceholder(/Amount in USD/i).fill("5");
  await dialog.getByText(/^N\/A$/).first().click();
  await page.getByText(/^Monthly$/).first().click();
  await dialog.getByRole("button", { name: /^Create$/ }).click();
  const secret = await copySecretViaClipboard(page, { origin: "https://openrouter.ai", button: /Copy key to clipboard/i, shape: /^sk-or-v1-[A-Za-z0-9_-]{20,}$/ });
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
