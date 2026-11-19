// Attaches to a dedicated Chrome started with --remote-debugging-port and its own --user-data-dir (Chrome 136+ ignores the
// debug port on the default profile). The owner signs in to the providers in that window; scripts reuse the session.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function makeBrowserSession({ cdpUrl, recipeDir }) {
  let browser = null;
  let context = null;
  return {
    async connect() {
      const { chromium } = await import("@playwright/test");
      browser = await chromium.connectOverCDP(cdpUrl);
      context = browser.contexts()[0];
    },
    page() {
      if (!context) throw new Error("browser session is not connected");
      return context.newPage();
    },
    async recipe(provider) {
      const file = join(recipeDir, `${provider}.mjs`);
      if (!existsSync(file)) throw new Error(`no recipe for provider "${provider}" yet; rotate it by hand (docs/infra/ROTATION.md)`);
      return import(pathToFileURL(file).href);
    },
    async close() {
      await browser?.close();
    },
  };
}
