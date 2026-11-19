// Groq API key. List page and create dialog walked 2026-11-18 (dialog opened, nothing created). The reveal and delete steps
// are NOT walked yet: run `--only groq --apply` once with the owner watching; a failure stops before any revoke.
// Cloudflare Turnstile guards the form: if a challenge appears the owner must click it (this recipe never bypasses it).
import { captureSecret, httpCheck, listTails, runStamp } from "./_lib.mjs";

const TAIL = "gsk_\\.\\.\\.[A-Za-z0-9]{4}";

export async function create(page) {
  await page.goto("https://console.groq.com/keys");
  const oldTails = await listTails(page, TAIL);
  await page.getByRole("button", { name: /Create API Key/i }).first().click();
  await page.getByPlaceholder(/Production API Key/i).fill(runStamp());
  await page.getByRole("button", { name: /^(Submit|Create)/i }).last().click();
  const secret = await captureSecret(page, "gsk_[A-Za-z0-9]{20,}");
  await page.close();
  return { values: { secret }, oldRef: oldTails.join(",") };
}

export const check = (values) => httpCheck("https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${values.secret}` });

export async function revoke(page, oldRef) {
  await page.goto("https://console.groq.com/keys");
  for (const tail of oldRef.split(",").filter(Boolean)) {
    const row = page.locator("tr", { hasText: tail }).first();
    await row.getByRole("button").last().click();
    await page.getByRole("button", { name: /delete|revoke/i }).last().click();
    await page.getByRole("button", { name: /^(delete|revoke|confirm)/i }).last().click();
    await row.waitFor({ state: "detached", timeout: 15000 });
  }
  await page.close();
}
