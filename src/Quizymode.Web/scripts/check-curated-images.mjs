#!/usr/bin/env node
// Post-build check for curated question pictures (#407) and About screenshots (#885). Run after `npm run build`;
// exits 1 on any problem:
//  - a data:image/webp URI was inlined into a dist JS bundle
//  - the number of distinct source .webp files (src/assets/curated and src/assets/about together) differs from
//    dist/assets/m/*.webp
// `--src <dir>` may be given more than once; without it both default folders are read.
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

export function checkCuratedImages({ srcDir, srcDirs, distDir }) {
  const problems = [];
  const sourceDirs = srcDirs ?? [srcDir];

  const sourceHashes = new Set(
    sourceDirs
      .flatMap((dir) => walk(dir))
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

function readArgs(name) {
  return process.argv
    .flatMap((arg, index) => (arg === name && process.argv[index + 1] ? [path.resolve(process.argv[index + 1])] : []));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const givenSrc = readArgs("--src");
  const srcDirs =
    givenSrc.length > 0
      ? givenSrc
      : [path.join(root, "src", "assets", "curated"), path.join(root, "src", "assets", "about")];
  const distDir = readArg("--dist", path.join(root, "dist"));
  const { problems, sourceCount, emittedCount } = checkCuratedImages({ srcDirs, distDir });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-curated-images: ${problem}`);
    process.exit(1);
  }
  console.log(`check-curated-images: ok (${sourceCount} source, ${emittedCount} emitted, none inlined)`);
}
