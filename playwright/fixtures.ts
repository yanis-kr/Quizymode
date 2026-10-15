import { test as base, expect } from "@playwright/test";

/**
 * Must match INTERNAL_BROWSER_STORAGE_KEY in src/Quizymode.Web/src/utils/pageViewTracking.ts.
 * Runs often target production, so every browser context is marked internal before any page
 * script runs; the SPA then sends the marker with each page hit and reports exclude the session.
 */
export const INTERNAL_BROWSER_STORAGE_KEY = "quizymode.analytics.internal-browser";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((key: string) => {
      try {
        window.localStorage.setItem(key, "true");
      } catch {
        // Storage can be unavailable on special pages such as about:blank.
      }
    }, INTERNAL_BROWSER_STORAGE_KEY);
    await use(context);
  },
});

export { expect };
