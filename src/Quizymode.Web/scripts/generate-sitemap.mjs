import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const SITE_URL = "https://www.quizymode.com";
const WEB_ROOT = resolve(import.meta.dirname, "..");
const TAXONOMY_PATH = resolve(WEB_ROOT, "..", "..", "docs", "quizymode_taxonomy.yaml");
const SITEMAP_PATH = resolve(WEB_ROOT, "public", "sitemap.xml");
const REPO_ROOT = resolve(WEB_ROOT, "..", "..");

// Use the last git commit date of the taxonomy file as lastmod.
// This stays stable across builds and only advances when the taxonomy actually changes.
// Falls back to today if git is unavailable (e.g. fresh checkout without history).
function getTaxonomyLastMod() {
  try {
    const date = execSync("git log -1 --format=%cs -- docs/quizymode_taxonomy.yaml", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    return date || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const LAST_MOD = getTaxonomyLastMod();

function parseTaxonomy(yamlText) {
  const categories = [];
  let currentCategory = null;
  let currentL1 = null;
  let inCategoryKeywords = false;
  let inL1Keywords = false;

  for (const rawLine of yamlText.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "    ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([^:]+):(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const key = match[1].trim();

    if (indent === 0) {
      currentCategory = { slug: key, groups: [] };
      categories.push(currentCategory);
      currentL1 = null;
      inCategoryKeywords = false;
      inL1Keywords = false;
      continue;
    }

    if (indent === 2) {
      inCategoryKeywords = key === "keywords";
      if (!inCategoryKeywords) {
        currentL1 = null;
        inL1Keywords = false;
      }
      continue;
    }

    if (indent === 4) {
      if (!inCategoryKeywords || currentCategory == null) {
        continue;
      }

      currentL1 = { slug: key, keywords: [] };
      currentCategory.groups.push(currentL1);
      inL1Keywords = false;
      continue;
    }

    if (indent === 6) {
      inL1Keywords = key === "keywords";
      continue;
    }

    if (indent === 8 && inL1Keywords && currentL1 != null) {
      currentL1.keywords.push(key);
    }
  }

  return categories;
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildUrlEntry(path, changefreq, priority) {
  const loc = `${SITE_URL}${path}`;
  return [
    "  <url>",
    `    <loc>${xmlEscape(loc)}</loc>`,
    `    <lastmod>${LAST_MOD}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n");
}

const staticPaths = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/categories", changefreq: "weekly", priority: 0.9 },
  { path: "/collections", changefreq: "weekly", priority: 0.8 },
  { path: "/about", changefreq: "monthly", priority: 0.7 },
  { path: "/ideas", changefreq: "weekly", priority: 0.8 },
  { path: "/roadmap", changefreq: "monthly", priority: 0.6 },
  { path: "/feedback", changefreq: "monthly", priority: 0.6 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.3 },
];

const taxonomy = parseTaxonomy(readFileSync(TAXONOMY_PATH, "utf8"));
const dynamicPaths = [];

for (const category of taxonomy) {
  dynamicPaths.push({
    path: `/categories/${encodeURIComponent(category.slug)}`,
    changefreq: "weekly",
    priority: 0.8,
  });

  for (const group of category.groups) {
    const l1Path = `/categories/${encodeURIComponent(category.slug)}/${encodeURIComponent(group.slug)}`;
    dynamicPaths.push({
      path: l1Path,
      changefreq: "weekly",
      priority: 0.7,
    });

    for (const keyword of group.keywords) {
      dynamicPaths.push({
        path: `${l1Path}/${encodeURIComponent(keyword)}`,
        changefreq: "weekly",
        priority: 0.6,
      });
    }
  }
}

const uniquePaths = new Map();
for (const entry of [...staticPaths, ...dynamicPaths]) {
  uniquePaths.set(entry.path, entry);
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Array.from(uniquePaths.values()).map((entry) =>
    buildUrlEntry(entry.path, entry.changefreq, entry.priority)
  ),
  "</urlset>",
  "",
].join("\n");

writeFileSync(SITEMAP_PATH, xml, "utf8");
console.log(`Generated ${uniquePaths.size} sitemap URLs at ${SITEMAP_PATH}`);
