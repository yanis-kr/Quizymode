// Gemini API key in Google AI Studio. List page, "Create API key" dialog (input labelled "Name your key", "Create key")
// walked 2026-11-19. The full key is not page text; AI Studio only gives it through the panel copy button, so the script finds
// the new row by its masked tail and reads the key from the clipboard after "Copy key to clipboard", inside the script. A key already
// named like this run (a half-finished earlier run) is adopted instead of creating a duplicate. Delete is NOT walked yet:
// the revoke step needs one watched run. Only the row named "GeminiQuizymode" is replaced; "Default Gemini API Key" is
// not ours and is never touched.
import { httpCheck, runStamp } from "./_lib.mjs";

const OUR_ROW = /GeminiQuizymode/;
const LIST = "https://aistudio.google.com/api-keys";

async function openList(page) {
  await page.goto(LIST);
  await page.waitForTimeout(4000);
}

const tailOf = (text) => /\.\.\.([A-Za-z0-9_-]{4})/.exec(text)?.[1] ?? "";

// The key's detail panel has "Copy key to clipboard". The script reads the clipboard itself (never printed), checks the
// shape and that it ends with the tail shown in the list, then clears the clipboard.
const KEY_SHAPE = /^(?:AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_.-]{30,})$/;

async function readKeyEndingWith(page, tail, rowButton) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://aistudio.google.com" });
  await rowButton.click();
  await page.getByRole("button", { name: /Copy key to clipboard/i }).first().click();
  await page.waitForTimeout(1000);
  const value = await page.evaluate(async () => {
    const text = await navigator.clipboard.readText();
    await navigator.clipboard.writeText("");
    return text;
  });
  if (!KEY_SHAPE.test(value) || !value.endsWith(tail)) throw new Error("the copied value is not the new Gemini key (the provider UI may have changed; update the recipe)");
  return value;
}

export async function create(page) {
  await openList(page);
  const oldTail = tailOf(await page.locator("tr", { hasText: OUR_ROW }).first().innerText());
  if (!oldTail) throw new Error("could not find the current GeminiQuizymode key row");
  const stamp = runStamp();
  let mine = page.locator("tr", { hasText: stamp });
  if ((await mine.count()) === 0) {
    await page.getByRole("button", { name: /Create API key/i }).first().click();
    await page.getByLabel(/Name your key/i).fill(stamp);
    await page.getByRole("button", { name: /^Create key$/i }).click();
    await page.waitForTimeout(3000);
    await openList(page);
    mine = page.locator("tr", { hasText: stamp });
  }
  const newTail = tailOf(await mine.first().innerText());
  if (!newTail || newTail === oldTail) throw new Error("could not identify the new Gemini key row");
  const secret = await readKeyEndingWith(page, newTail, mine.first().getByRole("button", { name: new RegExp(newTail) }).first());
  await page.close();
  return { values: { secret }, oldRef: "..." + oldTail };
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
