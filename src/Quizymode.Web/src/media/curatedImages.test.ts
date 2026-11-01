import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildCuratedImageMap,
  isItemImageReference,
  resolveCuratedImage,
} from "./curatedImages";

const map = buildCuratedImageMap({
  "../assets/curated/flags/fr.webp": "/assets/m/abc.webp",
  "../assets/curated/flags/it.webp": "/assets/m/def.webp",
  "../assets/curated/flags/Bad.webp": "/assets/m/bad.webp",
  "../assets/other/flags/xx.webp": "/assets/m/other.webp",
  "../assets/curated/flags/fr.png": "/assets/m/png.png",
});

describe("buildCuratedImageMap", () => {
  it("maps asset paths to curated keys and ignores everything else", () => {
    expect([...map.keys()].sort()).toEqual(["curated:flags/fr", "curated:flags/it"]);
  });
});

describe("resolveCuratedImage", () => {
  it("returns the bundled URL for a known key", () => {
    expect(resolveCuratedImage("curated:flags/fr", map)).toBe("/assets/m/abc.webp");
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "https://evil/x.webp",
    "//evil/x.webp",
    "curated:../x",
    "curated:flags/FR",
    "curated:flags/de",
    "curated:flags/fr/../it",
    "curated:flags/fr.webp",
    "",
  ])("never resolves %j", (key) => {
    expect(resolveCuratedImage(key, map)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(resolveCuratedImage(undefined as unknown as string, map)).toBeNull();
  });

  it("returns null when nothing is bundled", () => {
    expect(resolveCuratedImage("curated:flags/fr")).toBeNull();
  });
});

describe("isItemImageReference", () => {
  it("accepts a well-shaped reference", () => {
    expect(isItemImageReference({ key: "curated:flags/fr", altText: "Three bands" })).toBe(true);
  });

  it.each([
    null,
    "curated:flags/fr",
    {},
    { key: "curated:flags/fr" },
    { key: "curated:flags/fr", altText: "" },
    { key: "curated:flags/fr", altText: "x".repeat(301) },
    { key: "https://evil/x.webp", altText: "alt" },
    { key: "curated:flags/FR", altText: "alt" },
    { key: 5, altText: "alt" },
  ])("rejects %j", (value) => {
    expect(isItemImageReference(value)).toBe(false);
  });
});

/** Every questionImage.key committed under data/ must resolve to a bundled .webp (runs in CI). */
describe("seed data questionImage keys", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");

  function collectJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsonFiles(full);
      return entry.name.endsWith(".json") ? [full] : [];
    });
  }

  it("resolve through the bundled map", () => {
    const keys = new Set<string>();
    for (const root of ["data/seed-source/items", "data/seed-dev/items"]) {
      for (const file of collectJsonFiles(path.join(repoRoot, root))) {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed as Array<{ questionImage?: { key?: string } | null }>) {
          if (item?.questionImage?.key) keys.add(item.questionImage.key);
        }
      }
    }
    const unresolved = [...keys].filter((key) => resolveCuratedImage(key) === null);
    expect(unresolved).toEqual([]);
  });
});
