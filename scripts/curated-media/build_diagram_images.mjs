#!/usr/bin/env node
// Builds the curated explanation diagrams (#403) from self-authored SVG sources.
//
//   node scripts/curated-media/build_diagram_images.mjs            rasterize every source, rewrite the manifest hashes
//   node scripts/curated-media/build_diagram_images.mjs --check     offline: manifest <-> sources <-> files <-> seed items
//   node scripts/curated-media/build_diagram_images.mjs --check --rebuild
//                                                                also re-rasterize and require byte-identical output
//
// Input:  data/curated-media/diagrams/src/<name>.svg (authored in this repo, CC0-1.0, author "Quizymode")
//         data/curated-media/diagrams/manifest.json (name, title, altText per diagram; hashes are written by the build)
// Output: src/Quizymode.Web/src/assets/curated/diagrams/<name>.webp (900 px wide, WebP, at most 50 KiB each)
//
// The sources contain no <text> (labels are drawn as paths), so the output does not depend on installed fonts.
// Sources are read as bytes only; SVGs with scripts, entities or external references are rejected.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIAGRAMS_DIR = path.join(ROOT, "data", "curated-media", "diagrams");
const SOURCE_DIR = path.join(DIAGRAMS_DIR, "src");
const MANIFEST_PATH = path.join(DIAGRAMS_DIR, "manifest.json");
const OUTPUT_DIR = path.join(ROOT, "src", "Quizymode.Web", "src", "assets", "curated", "diagrams");
const SEED_ITEMS_DIR = path.join(ROOT, "data", "seed-source", "items");

const KEY_PREFIX = "curated:diagrams/";
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OUTPUT_WIDTH = 900;
const MAX_BYTES = 51200;
const QUALITIES = [90, 86, 82, 78, 74, 70, 65, 60];
const WEBP_EFFORT = 6;
const LICENSE = "CC0-1.0";
const AUTHOR = "Quizymode";
const ALT_MAX = 300;

const args = process.argv.slice(2);
const checkMode = args.includes("--check");
const rebuild = args.includes("--rebuild");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function svgProblem(svgText) {
  if (/<script/i.test(svgText)) return "contains <script>";
  if (/<!ENTITY/i.test(svgText)) return "declares an entity";
  if (/<foreignObject/i.test(svgText)) return "contains <foreignObject>";
  if (/<text[\s>]/i.test(svgText)) return "contains <text> (draw labels as paths so output does not depend on fonts)";
  for (const match of svgText.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    if (!match[1].trim().startsWith("#")) return `external reference '${match[1]}'`;
  }
  return null;
}

export function altProblem(alt) {
  if (typeof alt !== "string" || alt.trim().length === 0) return "altText is required";
  if (alt.length > ALT_MAX) return `altText is longer than ${ALT_MAX} characters`;
  if ([...alt].some((ch) => ch.charCodeAt(0) < 32 || (ch.charCodeAt(0) >= 127 && ch.charCodeAt(0) <= 159))) {
    return "altText has line breaks or control characters";
  }
  return null;
}

async function encode(svgBytes) {
  const base = sharp(svgBytes, { density: 216 }).resize({ width: OUTPUT_WIDTH, kernel: "lanczos3" });
  for (const quality of QUALITIES) {
    const { data, info } = await base.clone().webp({ quality, effort: WEBP_EFFORT }).toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_BYTES) return { data, quality, width: info.width, height: info.height };
  }
  throw new Error(`could not fit ${MAX_BYTES} bytes at quality ${QUALITIES.at(-1)}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Every curated:diagrams/ reference in the seed-source items: [{ key, altText, where }]. */
export function seedDiagramReferences(itemsDir = SEED_ITEMS_DIR) {
  const references = [];
  for (const file of walk(itemsDir).filter((candidate) => candidate.endsWith(".json"))) {
    const items = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(items)) continue;
    items.forEach((item, index) => {
      for (const field of ["questionImage", "explanationImage"]) {
        const image = item?.[field];
        if (image && typeof image.key === "string" && image.key.startsWith(KEY_PREFIX)) {
          references.push({ key: image.key, altText: image.altText, where: `${path.relative(ROOT, file)} item ${index} ${field}` });
        }
      }
    });
  }
  return references;
}

async function build(manifest) {
  const problems = [];
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const entry of manifest.entries) {
    try {
      const sourceFile = path.join(SOURCE_DIR, `${entry.name}.svg`);
      const bytes = fs.readFileSync(sourceFile);
      const problem = svgProblem(bytes.toString("utf8"));
      if (problem) throw new Error(`rejected source SVG (${problem})`);
      const { data, quality, width, height } = await encode(bytes);
      entry.key = `${KEY_PREFIX}${entry.name}`;
      entry.source = `src/${entry.name}.svg`;
      entry.license = LICENSE;
      entry.author = AUTHOR;
      entry.sourceSha256 = sha256(bytes);
      entry.output = `diagrams/${entry.name}.webp`;
      entry.outputBytes = data.length;
      entry.outputSha256 = sha256(data);
      entry.outputWidth = width;
      entry.outputHeight = height;
      entry.webpQuality = quality;
      fs.writeFileSync(path.join(OUTPUT_DIR, `${entry.name}.webp`), data);
      console.log(`${entry.name}: ${data.length} bytes (q${quality}, ${width}x${height})`);
    } catch (error) {
      problems.push(`${entry.name}: ${error.message}`);
    }
  }
  manifest.encoder = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, effort: WEBP_EFFORT };
  writeManifest(manifest);
  for (const problem of problems) console.error(`ERROR: ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

export async function check(manifest, { rebuildOutputs = false, itemsDir = SEED_ITEMS_DIR } = {}) {
  const problems = [];
  const names = new Set();
  const expectedSources = new Set();
  const expectedOutputs = new Set();

  for (const entry of manifest.entries) {
    const label = entry.name ?? "(unnamed)";
    if (!NAME_PATTERN.test(entry.name ?? "")) problems.push(`${label}: name must be lowercase letters, digits and hyphens`);
    if (names.has(entry.name)) problems.push(`${label}: duplicate manifest entry`);
    names.add(entry.name);
    expectedSources.add(`${entry.name}.svg`);
    expectedOutputs.add(`${entry.name}.webp`);

    if (entry.key !== `${KEY_PREFIX}${entry.name}`) problems.push(`${label}: key must be '${KEY_PREFIX}${entry.name}'`);
    if (entry.license !== LICENSE) problems.push(`${label}: license must be ${LICENSE}`);
    if (entry.author !== AUTHOR) problems.push(`${label}: author must be '${AUTHOR}'`);
    if (!entry.title) problems.push(`${label}: title is missing`);
    const alt = altProblem(entry.altText);
    if (alt) problems.push(`${label}: ${alt}`);

    const sourceFile = path.join(SOURCE_DIR, `${entry.name}.svg`);
    if (!fs.existsSync(sourceFile)) {
      problems.push(`${label}: ${path.relative(ROOT, sourceFile)} is missing`);
    } else {
      const bytes = fs.readFileSync(sourceFile);
      const problem = svgProblem(bytes.toString("utf8"));
      if (problem) problems.push(`${label}: source SVG rejected (${problem})`);
      if (sha256(bytes) !== entry.sourceSha256) problems.push(`${label}: source SVG differs from the manifest hash (run npm run build:diagram-images)`);
    }

    const outputFile = path.join(OUTPUT_DIR, `${entry.name}.webp`);
    if (!fs.existsSync(outputFile)) {
      problems.push(`${label}: ${path.relative(ROOT, outputFile)} is missing`);
      continue;
    }
    const bytes = fs.readFileSync(outputFile);
    if (bytes.length > MAX_BYTES) problems.push(`${label}: ${bytes.length} bytes exceeds the ${MAX_BYTES} budget`);
    if (bytes.length !== entry.outputBytes) problems.push(`${label}: size ${bytes.length} differs from manifest ${entry.outputBytes}`);
    if (sha256(bytes) !== entry.outputSha256) problems.push(`${label}: SHA-256 differs from manifest`);
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "webp" || meta.width !== OUTPUT_WIDTH) {
      problems.push(`${label}: expected WebP ${OUTPUT_WIDTH} px wide, got ${meta.format} ${meta.width}x${meta.height}`);
    }

    if (rebuildOutputs && fs.existsSync(sourceFile)) {
      const rebuilt = await encode(fs.readFileSync(sourceFile));
      if (sha256(rebuilt.data) !== entry.outputSha256) problems.push(`${label}: rebuilt output differs from the committed file`);
    }
  }

  for (const [dir, expected, what] of [
    [SOURCE_DIR, expectedSources, "src"],
    [OUTPUT_DIR, expectedOutputs, "assets/curated/diagrams"],
  ]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!expected.has(name)) problems.push(`${name}: file in ${what} has no manifest entry`);
    }
  }

  // Every seed item that points at a diagram must name a manifest entry and carry the manifest's alt text.
  const byKey = new Map(manifest.entries.map((entry) => [entry.key, entry]));
  for (const reference of seedDiagramReferences(itemsDir)) {
    const entry = byKey.get(reference.key);
    if (!entry) problems.push(`${reference.where}: '${reference.key}' has no manifest entry`);
    else if (entry.altText !== reference.altText) problems.push(`${reference.where}: altText differs from the manifest entry for '${reference.key}'`);
  }

  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const manifest = readManifest();
  if (checkMode) {
    const problems = await check(manifest, { rebuildOutputs: rebuild });
    for (const problem of problems) console.error(`ERROR: ${problem}`);
    if (problems.length > 0) {
      process.exitCode = 1;
    } else {
      const totalBytes = manifest.entries.reduce((sum, entry) => sum + (entry.outputBytes ?? 0), 0);
      console.log(
        `Diagram images OK: ${manifest.entries.length} entries, ${totalBytes} bytes total` +
          (rebuild ? ", rebuilt byte-for-byte from the SVG sources." : " (offline check; add --rebuild to re-rasterize)."),
      );
    }
  } else {
    await build(manifest);
  }
}
