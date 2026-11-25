#!/usr/bin/env node
// Builds the CloudFront response headers policy for the production web app (#811, AC 4.6.21 to 4.6.23).
//
//   node scripts/infra/web-security-headers.mjs [--mode report-only|enforce] [--out <file>]
//
// Reads src/Quizymode.Web/index.html (inline script hashes) and .env.production (API and Cognito origins), prints
// the policy JSON for `aws cloudfront create-response-headers-policy|update-response-headers-policy`. See
// docs/infra/WEB_SECURITY_HEADERS.md for the rollout and the commands. Nothing here calls AWS.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const POLICY_NAME = "quizymode-web-security-headers";

/** sha256 CSP source for each inline <script> (no src attribute) in an HTML document. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!m[1].trim()) continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** Reads the VITE_* values this policy depends on from the text of an env file. */
export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const originOf = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
};

/** The Content-Security-Policy value. Frames are denied; the API origin carries data and pictures; Cognito is called by the SDK. */
export function buildCsp({ html, env }) {
  const api = originOf(env.VITE_API_URL);
  const region = String(env.VITE_COGNITO_REGION || "us-east-1").trim();
  const cognito = `https://cognito-idp.${region}.amazonaws.com`;
  const hostedUi = originOf(env.VITE_COGNITO_DOMAIN);
  if (!api) throw new Error("VITE_API_URL must be an https URL; the CSP would block every API call without it");
  const connect = ["'self'", api, cognito, hostedUi].filter(Boolean);
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(html)],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", api],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/** camera is used by photo capture (AC 6.6.53); everything else the app never uses is switched off. */
export const PERMISSIONS_POLICY = "camera=(self), microphone=(), geolocation=(), payment=(), usb=()";

export function buildPolicy({ html, env, mode = "report-only" }) {
  if (mode !== "report-only" && mode !== "enforce") throw new Error(`mode must be report-only or enforce, got ${mode}`);
  const csp = buildCsp({ html, env });
  const security = {
    ContentTypeOptions: { Override: true },
    FrameOptions: { FrameOption: "DENY", Override: true },
    ReferrerPolicy: { ReferrerPolicy: "strict-origin-when-cross-origin", Override: true },
    StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: false, Preload: false, Override: true },
  };
  const custom = [{ Header: "Permissions-Policy", Value: PERMISSIONS_POLICY, Override: true }];
  if (mode === "enforce") security.ContentSecurityPolicy = { ContentSecurityPolicy: csp, Override: true };
  else custom.push({ Header: "Content-Security-Policy-Report-Only", Value: csp, Override: true });
  return {
    Name: POLICY_NAME,
    Comment: `Quizymode web security headers (#811), CSP ${mode}`,
    SecurityHeadersConfig: security,
    CustomHeadersConfig: { Quantity: custom.length, Items: custom },
  };
}

function main(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const web = path.join(root, "src", "Quizymode.Web");
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  const env = parseEnv(fs.readFileSync(path.join(web, ".env.production"), "utf8"));
  const json = JSON.stringify(buildPolicy({ html, env, mode: get("--mode") ?? "report-only" }), null, 2);
  const out = get("--out");
  if (out) fs.writeFileSync(out, json + "\n");
  else process.stdout.write(json + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
