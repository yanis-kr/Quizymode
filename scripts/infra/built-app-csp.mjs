// Serves the production web build (src/Quizymode.Web/dist) to a Playwright page under the production
// Content-Security-Policy, without a server (#918, AC 4.6.27). Every other origin is answered with empty JSON, so the
// check never reaches the production API or sign-in service.
import fs from "node:fs";
import path from "node:path";

export const BUILT_APP_ORIGIN = "https://built.quizymode.test";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

export async function serveBuiltApp(page, { distDir, csp }) {
  const root = path.resolve(distDir);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BUILT_APP_ORIGIN) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": BUILT_APP_ORIGIN, "access-control-allow-credentials": "true" },
        body: "{}",
      });
    }

    // Paths without an extension are app routes and get index.html, like the CloudFront rewrite Function.
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !path.extname(file)) file = path.join(root, "index.html");
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    const contentType = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
    const headers = contentType.startsWith("text/html") ? { "content-security-policy": csp } : {};
    return route.fulfill({ status: 200, contentType, headers, body: fs.readFileSync(file) });
  });
}

/** Records every securitypolicyviolation of the page; read them with `readCspViolations`. */
export async function watchCspViolations(page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`),
    );
  });
}

export const readCspViolations = (page) => page.evaluate(() => window.__cspViolations);
