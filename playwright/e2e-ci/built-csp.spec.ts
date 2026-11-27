import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BUILT_APP_ORIGIN, readCspViolations, serveBuiltApp, watchCspViolations } from "../../scripts/infra/built-app-csp.mjs";
import { buildCsp, parseEnv } from "../../scripts/infra/web-security-headers.mjs";

// AC 4.6.27 (#918): chunk evaluation order exists only in the production build, so this reads `dist` (built by the CI e2e
// job before the tests), not the Development server the other specs use.
const web = path.resolve("src/Quizymode.Web");
const distDir = path.join(web, "dist");

for (const route of ["/", "/about", "/start", "/search", "/categories"]) {
  test(`AC 4.6.27 the production build raises no Content-Security-Policy violation on ${route}`, async ({ page }) => {
    const index = path.join(distDir, "index.html");
    expect(fs.existsSync(index), "build the web app first: npm run build --prefix src/Quizymode.Web").toBe(true);
    const csp = buildCsp({
      html: fs.readFileSync(index, "utf8"),
      env: parseEnv(fs.readFileSync(path.join(web, ".env.production"), "utf8")),
    });
    await serveBuiltApp(page, { distDir, csp });
    await watchCspViolations(page);

    await page.goto(`${BUILT_APP_ORIGIN}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
    // The app has rendered, so its schema modules have run.
    await expect(page.locator("#root > *").first()).toBeAttached({ timeout: 15_000 });

    expect(await readCspViolations(page)).toEqual([]);
  });
}
