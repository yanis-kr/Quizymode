#!/usr/bin/env node
// Post-deploy check (#916, AC 4.6.26): every executable inline script of the served page must be allowed by the served
// Content-Security-Policy. Reads one page anonymously; changes nothing.
//
//   node scripts/infra/check-live-csp.mjs [url]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScriptHash } from "./web-security-headers.mjs";

const EXECUTABLE_TYPES = ["", "module", "text/javascript", "application/javascript"];

/** The sha256 sources of executable inline scripts in the page that the policy's script-src does not list. */
export function blockedInlineScripts(html, csp) {
  const directive = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "));
  const allowed = new Set(directive ? directive.split(/\s+/).slice(1) : []);
  const blocked = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = (/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(m[1])?.[1] ?? "").toLowerCase();
    if (!m[2].trim() || !EXECUTABLE_TYPES.includes(type)) continue;
    const hash = inlineScriptHash(m[2]);
    if (!allowed.has(hash)) blocked.push(hash);
  }
  return blocked;
}

async function main(url) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const csp = response.headers.get("content-security-policy");
  if (!csp) throw new Error(`${url} sent no Content-Security-Policy header`);
  const blocked = blockedInlineScripts(await response.text(), csp);
  if (blocked.length > 0) {
    throw new Error(`the policy blocks inline script(s) ${blocked.join(" ")}; update the headers Function (docs/infra/WEB_SECURITY_HEADERS.md)`);
  }
  console.log(`check-live-csp: ok, every executable inline script of ${url} is allowed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ?? "https://www.quizymode.com/").catch((error) => {
    console.error(`check-live-csp: ${error.message}`);
    process.exitCode = 1;
  });
}
