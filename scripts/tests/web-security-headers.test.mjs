// Tests for #811 (AC 4.6.21 to 4.6.23): the production web security headers policy builder. No AWS calls, no temp folders.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsp, buildPolicy, inlineScriptHashes, parseEnv } from "../infra/web-security-headers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = fs.readFileSync(path.join(root, "src", "Quizymode.Web", "index.html"), "utf8");
const env = parseEnv(fs.readFileSync(path.join(root, "src", "Quizymode.Web", ".env.production"), "utf8"));

// AC 4.6.21: the inline theme script is allowed by hash, never by 'unsafe-inline' in script-src.
test("AC 4.6.21: script-src allows the inline theme script by hash only", () => {
  const hashes = inlineScriptHashes(html);
  assert.ok(hashes.length >= 1, "index.html has an inline script");
  const csp = buildCsp({ html, env });
  const script = csp.split("; ").find((d) => d.startsWith("script-src "));
  for (const h of hashes) assert.ok(script.includes(h));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.ok(script.includes("'wasm-unsafe-eval'"), "OCR needs WebAssembly");
});

// AC 4.6.21: framing is denied and the sign-in, API and OCR worker origins stay reachable.
test("AC 4.6.21: framing denied, API, Cognito and workers allowed", () => {
  const csp = buildCsp({ html, env });
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /worker-src 'self' blob:/);
  const connect = csp.split("; ").find((d) => d.startsWith("connect-src "));
  assert.ok(connect.includes(new URL(env.VITE_API_URL).origin));
  assert.ok(connect.includes(`https://cognito-idp.${env.VITE_COGNITO_REGION}.amazonaws.com`));
});

// AC 4.6.22: report-only first. The enforcing header is only present in enforce mode, never both.
test("AC 4.6.22: report-only mode sends no enforcing CSP; enforce mode sends it", () => {
  const ro = buildPolicy({ html, env });
  assert.equal(ro.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
  assert.ok(ro.CustomHeadersConfig.Items.some((h) => h.Header === "Content-Security-Policy-Report-Only"));
  const en = buildPolicy({ html, env, mode: "enforce" });
  assert.ok(en.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy.includes("default-src 'self'"));
  assert.ok(!en.CustomHeadersConfig.Items.some((h) => h.Header === "Content-Security-Policy-Report-Only"));
  assert.throws(() => buildPolicy({ html, env, mode: "maybe" }));
});

// AC 4.6.23: the always-on headers and a Permissions-Policy that keeps the camera for photo capture.
test("AC 4.6.23: nosniff, DENY, referrer policy, HSTS and a camera-preserving Permissions-Policy", () => {
  const p = buildPolicy({ html, env });
  const s = p.SecurityHeadersConfig;
  assert.equal(s.ContentTypeOptions.Override, true);
  assert.equal(s.FrameOptions.FrameOption, "DENY");
  assert.equal(s.ReferrerPolicy.ReferrerPolicy, "strict-origin-when-cross-origin");
  assert.equal(s.StrictTransportSecurity.IncludeSubdomains, false);
  const pp = p.CustomHeadersConfig.Items.find((h) => h.Header === "Permissions-Policy");
  assert.match(pp.Value, /camera=\(self\)/);
  assert.match(pp.Value, /microphone=\(\)/);
  assert.equal(p.CustomHeadersConfig.Quantity, p.CustomHeadersConfig.Items.length);
});

test("a missing API origin fails loudly instead of building a policy that blocks the API", () => {
  assert.throws(() => buildCsp({ html, env: { ...env, VITE_API_URL: "" } }), /VITE_API_URL/);
});
