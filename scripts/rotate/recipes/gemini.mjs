// Gemini API key in Google AI Studio. List page and "Create a new key" dialog (name box, project picker, "Create key")
// walked 2026-11-18, dialog cancelled. Reveal and delete are NOT walked yet: run `--only gemini --apply` once with the owner
// watching. Only the key row named "GeminiQuizymode" is replaced; "Default Gemini API Key" is not ours and is never touched.
import { captureSecret, httpCheck, runStamp } from "./_lib.mjs";

const OUR_ROW = /GeminiQuizymode/;

export async function create(page) {
  await page.goto("https://aistudio.google.com/api-keys");
  await page.waitForTimeout(4000);
  const rowText = await page.locator("tr", { hasText: OUR_ROW }).first().innerText();
  const oldTail = /\.\.\.[A-Za-z0-9_-]{4}/.exec(rowText)?.[0] ?? "";
  if (!oldTail) throw new Error("could not find the current GeminiQuizymode key row");
  await page.getByRole("button", { name: /Create API key/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill(runStamp());
  await dialog.getByRole("button", { name: /^Create key$/i }).click();
  const secret = await captureSecret(page, "AIza[0-9A-Za-z_-]{30,}", 45000);
  await page.close();
  return { values: { secret }, oldRef: oldTail };
}

export const check = (values) => httpCheck("https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": values.secret });

export async function revoke(page, oldTail) {
  if (!oldTail) return;
  await page.goto("https://aistudio.google.com/api-keys");
  await page.waitForTimeout(4000);
  const row = page.locator("tr", { hasText: oldTail }).filter({ hasText: OUR_ROW }).first();
  await row.getByRole("button", { name: /more actions|more_vert/i }).first().click();
  await page.getByRole("menuitem", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: /^(delete|confirm)/i }).last().click();
  await row.waitFor({ state: "detached", timeout: 20000 });
  await page.close();
}
