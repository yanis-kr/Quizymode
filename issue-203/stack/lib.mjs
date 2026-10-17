// Shared helpers for the #203 evidence scripts. Identity = local test issuer (fake-oidc.cs), NOT Cognito.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
export const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificates only
export const EV = "C:/Projects/Quizymode-wt-evidence/issue-203";
export const SPA = "http://localhost:7000";
export const API = "https://localhost:8082";
export const IDP = "https://localhost:7443";
export const CLIENT = "quizymode-local-evidence";
export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
fs.mkdirSync(`${EV}/screenshots`, { recursive: true });
fs.mkdirSync(`${EV}/logs`, { recursive: true });

export const results = [];
export function record(id, step, ok, detail) {
  const r = { id, step, outcome: ok ? "PASS" : "FAIL", detail };
  results.push(r);
  console.log(`[${r.outcome}] ${id} ${step} ${detail === undefined ? "" : JSON.stringify(detail)}`);
  return ok;
}
export function saveResults(name) {
  fs.writeFileSync(`${EV}/logs/${name}.json`, JSON.stringify(results, null, 2));
  fs.writeFileSync(
    `${EV}/logs/${name}.txt`,
    results.map((r) => `[${r.outcome}] ${r.id} ${r.step} ${r.detail === undefined ? "" : JSON.stringify(r.detail)}`).join("\n") + "\n"
  );
}

export function psql(sql) {
  return execFileSync("docker", ["exec", "qm-ev-203", "psql", "-U", "postgres", "-d", "quizymode", "-P", "pager=off", "-c", sql], { encoding: "utf8" });
}
export function scalar(sql) {
  return execFileSync("docker", ["exec", "qm-ev-203", "psql", "-U", "postgres", "-d", "quizymode", "-tAc", sql], { encoding: "utf8" }).trim();
}

export async function mint(sub, email, groups) {
  const q = new URLSearchParams({ sub, email, ...(groups ? { groups } : {}) });
  return (await fetch(`${IDP}/mint?${q}`)).json();
}
function setAmplifyTokens({ clientId, sub, idToken, accessToken }) {
  const p = `CognitoIdentityServiceProvider.${clientId}`;
  localStorage.setItem(`${p}.LastAuthUser`, sub);
  localStorage.setItem(`${p}.${sub}.idToken`, idToken);
  localStorage.setItem(`${p}.${sub}.accessToken`, accessToken);
  localStorage.setItem(`${p}.${sub}.refreshToken`, "local-evidence-refresh");
  localStorage.setItem(`${p}.${sub}.clockDrift`, "0");
}
export async function newContext(browser, who) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, userAgent: CHROME_UA });
  let token = null;
  if (who) {
    token = await mint(who.sub, who.email, who.groups);
    await context.addInitScript(setAmplifyTokens, { clientId: CLIENT, sub: who.sub, idToken: token.idToken, accessToken: token.accessToken });
  }
  return { context, token };
}

export const USERS = {
  alice: { sub: "alice-203", email: "alice203@example.com" },
  bob: { sub: "bob-203", email: "bob203@example.com" },
  admin: { sub: "admin-203", email: "admin203@example.com", groups: "Admins" },
};

/** Raw HTTP to the API with a bearer token (token never logged; only bearer:true is recorded). */
export async function http(method, urlPath, { who, json, form, headers } = {}) {
  const h = { ...(headers ?? {}) };
  if (who) h.authorization = `Bearer ${(await mint(who.sub, who.email, who.groups)).idToken}`;
  let body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(`${API}${urlPath}`, { method, headers: h, body });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
  return { status: res.status, body: parsed, bearer: Boolean(who) };
}

export async function uploadFile(who, filePath, extra = {}) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(filePath));
  form.append("category", "science");
  form.append("navigationKeyword1", "biology");
  form.append("navigationKeyword2", "cells");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return http("POST", "/study-guides/documents", { who, form });
}

export async function shot(page, name, opts = {}) {
  await page.screenshot({ path: `${EV}/screenshots/${name}.png`, fullPage: opts.fullPage ?? false });
}

export async function htmlShot(browser, name, title, preText) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page = await context.newPage();
  const esc = preText.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await page.setContent(`<html><body style="font-family:Segoe UI,Arial;margin:16px"><h2 style="margin:0 0 8px">${title}</h2><pre style="font-size:11px;line-height:1.35;white-space:pre-wrap;background:#f6f8fa;padding:12px;border:1px solid #ddd">${esc}</pre></body></html>`);
  await page.screenshot({ path: `${EV}/screenshots/${name}.png`, fullPage: true });
  await context.close();
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
