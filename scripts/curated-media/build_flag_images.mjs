#!/usr/bin/env node
// Builds the curated flag pictures (#407) from Wikimedia Commons.
//
//   node scripts/curated-media/build_flag_images.mjs            download, verify, rasterize, rewrite the manifest
//   node scripts/curated-media/build_flag_images.mjs --check     offline: manifest <-> files, sizes, licences, hashes
//   node scripts/curated-media/build_flag_images.mjs --check --rebuild
//                                                                also re-download and require byte-identical output
//   --only=fr,de   limit a build or rebuild to some iso2 codes
//
// Input:  data/curated-media/flags/manifest.json (entries need iso2, country, region, commonsFile).
// Output: src/Quizymode.Web/src/assets/curated/flags/<iso2>.webp (lowercase iso2, fit inside 640x640, WebP).
//
// Downloads are untrusted data. Each run downloads into its own new temp directory, the files are only read
// as bytes (sharp decodes the SVG; nothing is executed), SVGs with scripts, entities or external references
// are rejected, and the SHA-1 reported by the Commons API must match the downloaded bytes.
// Licences: public domain and CC0 are preferred; CC BY and CC BY-SA are accepted only with the author recorded
// so that docs/about.md can credit them. Anything else fails the build (use a flag-icons fallback and record it).
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = path.join(ROOT, "data", "curated-media", "flags", "manifest.json");
const OUTPUT_DIR = path.join(ROOT, "src", "Quizymode.Web", "src", "assets", "curated", "flags");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "QuizymodeFlagBuild/1.0 (https://www.quizymode.com; flag image build script)";

const MAX_DIMENSION = 640;
const MAX_BYTES = 102400;
const QUALITIES = [90, 86, 82, 78, 74, 70, 65, 60];
const WEBP_EFFORT = 6;

const args = process.argv.slice(2);
const checkMode = args.includes("--check");
const rebuild = args.includes("--rebuild");
const onlyArg = args.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

function sha(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyLicense(shortName) {
  const name = String(shortName ?? "").trim().toLowerCase();
  if (/^(public domain|pd([- ]|$)|no restrictions)/.test(name)) return "public-domain";
  if (/^cc0/.test(name) || /^cc[- ]zero/.test(name)) return "cc0";
  if (/^cc[- ]by[- ]sa[- ]\d/.test(name)) return "cc-by-sa";
  if (/^cc[- ]by[- ]\d/.test(name)) return "cc-by";
  return null;
}

function licenseProblem(entry) {
  const kind = classifyLicense(entry.license?.shortName);
  if (!kind) return `${entry.iso2}: licence '${entry.license?.shortName}' is not on the allowlist`;
  if ((kind === "cc-by" || kind === "cc-by-sa") && !entry.attribution) {
    return `${entry.iso2}: ${entry.license.shortName} requires a recorded attribution`;
  }
  return null;
}

function svgProblem(svgText) {
  if (/<script/i.test(svgText)) return "contains <script>";
  if (/<!ENTITY/i.test(svgText)) return "declares an entity";
  if (/<foreignObject/i.test(svgText)) return "contains <foreignObject>";
  for (const match of svgText.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    const value = match[1].trim();
    if (!value.startsWith("#") && !value.startsWith("data:image/")) return `external reference '${value}'`;
  }
  return null;
}

async function encode(svgBytes) {
  const meta = await sharp(svgBytes).metadata();
  const longest = Math.max(meta.width ?? 1, meta.height ?? 1);
  const density = Math.min(2000, Math.max(72, Math.ceil((72 * MAX_DIMENSION * 2) / longest)));
  const base = sharp(svgBytes, { density }).resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: "inside",
    kernel: "lanczos3",
  });
  for (const quality of QUALITIES) {
    const { data, info } = await base.clone().webp({ quality, effort: WEBP_EFFORT }).toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_BYTES) return { data, quality, width: info.width, height: info.height };
  }
  throw new Error(`could not fit ${MAX_BYTES} bytes at quality ${QUALITIES.at(-1)}`);
}

async function apiGet(params) {
  const url = `${COMMONS_API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) throw new Error(`Commons API ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
  throw new Error("Commons API kept failing");
}

async function fetchImageInfo(titles) {
  const result = new Map();
  for (let i = 0; i < titles.length; i += 25) {
    const batch = titles.slice(i, i + 25);
    const json = await apiGet({
      action: "query",
      redirects: "1",
      prop: "imageinfo",
      iiprop: "url|sha1|size|mime|extmetadata",
      titles: batch.map((title) => `File:${title}`).join("|"),
    });
    const redirectedFrom = new Map();
    for (const item of [...(json.query.normalized ?? []), ...(json.query.redirects ?? [])]) {
      redirectedFrom.set(item.to, item.from);
    }
    for (const page of json.query.pages) {
      let original = page.title;
      while (redirectedFrom.has(original)) original = redirectedFrom.get(original);
      result.set(original.replace(/^File:/, ""), page);
    }
  }
  return result;
}

async function download(url, destination) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(destination, bytes);
      return bytes;
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`download ${response.status} for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
  }
  throw new Error(`download kept failing for ${url}`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

// Downloads and verifies the source SVG of one entry into tempDir and returns the bytes.
async function fetchVerifiedSource(entry, tempDir) {
  const bytes = await download(entry.originalUrl, path.join(tempDir, `${entry.iso2}.svg`));
  if (sha("sha1", bytes) !== entry.sha1) throw new Error(`${entry.iso2}: SHA-1 mismatch for ${entry.originalUrl}`);
  const problem = svgProblem(bytes.toString("utf8"));
  if (problem) throw new Error(`${entry.iso2}: rejected source SVG (${problem})`);
  return bytes;
}

async function build(manifest) {
  const entries = manifest.entries.filter((entry) => !only || only.has(entry.iso2));
  const info = await fetchImageInfo(entries.map((entry) => entry.commonsFile));
  const problems = [];

  for (const entry of entries) {
    const page = info.get(entry.commonsFile);
    const image = page?.imageinfo?.[0];
    if (!image) {
      problems.push(`${entry.iso2}: '${entry.commonsFile}' not found on Commons`);
      continue;
    }
    const meta = image.extmetadata ?? {};
    entry.commonsFileResolved = page.title.replace(/^File:/, "");
    entry.sourcePageUrl = image.descriptionurl;
    entry.originalUrl = image.url.split("?")[0];
    entry.sha1 = image.sha1;
    entry.sourceWidth = image.width;
    entry.sourceHeight = image.height;
    entry.license = {
      shortName: stripHtml(meta.LicenseShortName?.value),
      url: meta.LicenseUrl?.value ?? null,
    };
    entry.attribution = stripHtml(meta.Artist?.value).replace(/^(.+?) $/, "$1") || null;
    entry.attributionRequired = String(meta.AttributionRequired?.value ?? "").toLowerCase() === "true";
    if (image.mime !== "image/svg+xml") problems.push(`${entry.iso2}: expected an SVG, got ${image.mime}`);
    const licenceIssue = licenseProblem(entry);
    if (licenceIssue) problems.push(licenceIssue);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`ERROR: ${problem}`);
    process.exitCode = 1;
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quizymode-flags-"));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  try {
    await mapLimit(entries, 4, async (entry) => {
      try {
        const svg = await fetchVerifiedSource(entry, tempDir);
        const { data, quality, width, height } = await encode(svg);
        entry.output = `flags/${entry.iso2}.webp`;
        entry.outputBytes = data.length;
        entry.outputSha256 = sha("sha256", data);
        entry.outputWidth = width;
        entry.outputHeight = height;
        entry.webpQuality = quality;
        fs.writeFileSync(path.join(OUTPUT_DIR, `${entry.iso2}.webp`), data);
        console.log(`${entry.iso2}: ${data.length} bytes (q${quality}, ${width}x${height})`);
      } catch (error) {
        problems.push(`${entry.iso2}: ${error.message}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  manifest.encoder = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, effort: WEBP_EFFORT };
  writeManifest(manifest);
  for (const problem of problems) console.error(`ERROR: ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

async function check(manifest) {
  const problems = [];
  const expected = new Set();
  const seen = new Set();

  for (const entry of manifest.entries) {
    if (seen.has(entry.iso2)) problems.push(`${entry.iso2}: duplicate manifest entry`);
    seen.add(entry.iso2);
    if (!/^[a-z]{2}$/.test(entry.iso2)) problems.push(`${entry.iso2}: iso2 must be two lowercase letters`);
    const file = path.join(OUTPUT_DIR, `${entry.iso2}.webp`);
    expected.add(`${entry.iso2}.webp`);

    if (only && !only.has(entry.iso2)) continue;
    const issue = licenseProblem(entry);
    if (issue) problems.push(issue);
    for (const field of ["country", "region", "commonsFile", "sourcePageUrl", "originalUrl", "sha1", "outputSha256"]) {
      if (!entry[field]) problems.push(`${entry.iso2}: manifest field '${field}' is missing`);
    }
    if (!fs.existsSync(file)) {
      problems.push(`${entry.iso2}: ${path.relative(ROOT, file)} is missing`);
      continue;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length > MAX_BYTES) problems.push(`${entry.iso2}: ${bytes.length} bytes exceeds the ${MAX_BYTES} budget`);
    if (bytes.length !== entry.outputBytes) problems.push(`${entry.iso2}: size ${bytes.length} differs from manifest ${entry.outputBytes}`);
    if (sha("sha256", bytes) !== entry.outputSha256) problems.push(`${entry.iso2}: SHA-256 differs from manifest`);
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "webp" || Math.max(meta.width, meta.height) > MAX_DIMENSION) {
      problems.push(`${entry.iso2}: expected WebP within ${MAX_DIMENSION}x${MAX_DIMENSION}, got ${meta.format} ${meta.width}x${meta.height}`);
    }
  }

  if (fs.existsSync(OUTPUT_DIR)) {
    for (const name of fs.readdirSync(OUTPUT_DIR)) {
      if (!expected.has(name)) problems.push(`${name}: file in assets/curated/flags has no manifest entry`);
    }
  }

  if (rebuild && problems.length === 0) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quizymode-flags-check-"));
    try {
      const entries = manifest.entries.filter((entry) => !only || only.has(entry.iso2));
      await mapLimit(entries, 4, async (entry) => {
        try {
          const svg = await fetchVerifiedSource(entry, tempDir);
          const { data } = await encode(svg);
          if (sha("sha256", data) !== entry.outputSha256) problems.push(`${entry.iso2}: rebuilt output differs from the committed file`);
        } catch (error) {
          problems.push(`${entry.iso2}: ${error.message}`);
        }
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const totalBytes = manifest.entries.reduce((sum, entry) => sum + (entry.outputBytes ?? 0), 0);
  for (const problem of problems) console.error(`ERROR: ${problem}`);
  if (problems.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `Flag images OK: ${manifest.entries.length} entries, ${totalBytes} bytes total` +
      (rebuild ? ", rebuilt byte-for-byte from Commons." : " (offline check; add --rebuild to re-download)."),
  );
}

const manifest = readManifest();
if (checkMode) await check(manifest);
else await build(manifest);
