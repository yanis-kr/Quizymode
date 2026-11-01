#!/usr/bin/env node
// Post-build check for curated question pictures (#407). Run after `npm run build`; exits 1 on any problem:
//  - a data:image/webp URI was inlined into a dist JS bundle
//  - the number of distinct source .webp files (src/assets/curated) differs from dist/assets/m/*.webp
//  - a .webp was emitted outside dist/assets/m
// Identical source files hash to one emitted asset, so sources are compared by content hash.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export function checkCuratedImages({ srcDir, distDir }) {
  const problems = [];

  const sourceHashes = new Set(
    walk(srcDir)
      .filter((file) => file.endsWith(".webp"))
      .map((file) => createHash("sha1").update(fs.readFileSync(file)).digest("hex")),
  );

  const distFiles = walk(distDir);
  const emittedDir = path.join(distDir, "assets", "m");
  const emitted = distFiles.filter((file) => file.endsWith(".webp") && path.dirname(file) === emittedDir);
  const strays = distFiles.filter((file) => file.endsWith(".webp") && path.dirname(file) !== emittedDir);

  for (const file of strays) {
    problems.push(`webp emitted outside assets/m: ${path.relative(distDir, file)}`);
  }

  for (const file of distFiles.filter((candidate) => candidate.endsWith(".js"))) {
    if (fs.readFileSync(file, "utf8").includes("data:image/webp")) {
      problems.push(`data:image/webp inlined into ${path.relative(distDir, file)}`);
    }
  }

  if (sourceHashes.size !== emitted.length) {
    problems.push(
      `expected ${sourceHashes.size} distinct .webp in dist/assets/m (one per distinct source file), found ${emitted.length}`,
    );
  }

  return { problems, sourceCount: sourceHashes.size, emittedCount: emitted.length };
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > -1 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : fallback;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const srcDir = readArg("--src", path.join(root, "src", "assets", "curated"));
  const distDir = readArg("--dist", path.join(root, "dist"));
  const { problems, sourceCount, emittedCount } = checkCuratedImages({ srcDir, distDir });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-curated-images: ${problem}`);
    process.exit(1);
  }
  console.log(`check-curated-images: ok (${sourceCount} source, ${emittedCount} emitted, none inlined)`);
}
