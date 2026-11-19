// Shared helpers for browser recipes. Rules: never log, screenshot or return page text; a secret is read inside the script by
// shape (regular expression) and handed to the caller; old credentials are identified by their masked tail, which is not a secret.

/** Every non-secret masked tail on the page that matches `tailPattern`, e.g. "gsk_...9Oc2". */
export async function listTails(page, tailPattern) {
  const text = await page.locator("body").innerText();
  return [...new Set(text.match(new RegExp(tailPattern, "g")) ?? [])];
}

/** Finds a freshly shown secret by its shape in input values and visible text; polls until found or timeout. */
export async function captureSecret(page, secretPattern, timeoutMs = 30000) {
  const re = new RegExp(secretPattern);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const found = await page.evaluate((source) => {
      const rx = new RegExp(source);
      for (const el of document.querySelectorAll("input, textarea")) {
        const m = rx.exec(el.value ?? "");
        if (m) return m[0];
      }
      const m = rx.exec(document.body.innerText);
      return m ? m[0] : null;
    }, re.source);
    if (found) return found;
    await page.waitForTimeout(500);
  }
  throw new Error("the new key never appeared on the page (the provider UI may have changed; update the recipe)");
}

/** Read-only API call proving a key works. The key goes in a header, never in a log or URL. */
export async function httpCheck(url, headers, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { headers });
    return res.ok;
  } catch {
    return false;
  }
}

export const runStamp = () => `quizymode-rotated-${new Date().toISOString().slice(0, 10)}`;
