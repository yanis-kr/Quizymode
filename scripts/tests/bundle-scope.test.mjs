// Tests for #761 gap 8 (AC 7.19.31): an issue's path scope falls back to its area map, and an unknown scope is never drift.
// Pure functions only; no git, no GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import { effectivePaths, overlappingFiles, pathsOverlap } from "../bundle/scope.mjs";

const AREAS = { "area:admin": ["src/Quizymode.Web/src/features/admin/", "src/Quizymode.Api/Features/Admin/"] };

// AC 7.19.31: declared scope.paths win over the area map.
test("AC 7.19.31: declared scope.paths win over the area map", () => {
  const issue = { scope: { paths: ["src/x/"] }, areas: ["area:admin"] };
  assert.deepEqual(effectivePaths(issue, AREAS), { paths: ["src/x/"], source: "scope" });
});

// AC 7.19.31: with no declared scope, the mapped area supplies the paths; with neither, the scope is unknown.
test("AC 7.19.31: an issue with no scope uses its area's paths, and is unknown when neither exists", () => {
  assert.equal(effectivePaths({ scope: { paths: [] }, areas: ["area:admin"] }, AREAS).source, "area");
  assert.deepEqual(effectivePaths({ scope: { paths: [] }, areas: ["area:ideas"] }, AREAS), { paths: [], source: "unknown" });
  assert.deepEqual(effectivePaths({ scope: { paths: [] } }, AREAS), { paths: [], source: "unknown" });
});

// AC 7.19.31: an unknown scope matches no changed file, so a base move cannot flag it as drift.
test("AC 7.19.31: an unknown scope matches no changed file, so a base move cannot flag it as drift", () => {
  assert.deepEqual(overlappingFiles([], ["src/a.cs", "docs/x.md"]), []);
});

// AC 7.19.31: overlap reads the declared or mapped paths; disjoint areas do not share a lane.
test("AC 7.19.31: overlap reads the declared or mapped paths, and disjoint scopes do not share a lane", () => {
  assert.deepEqual(overlappingFiles(["src/Quizymode.Api/Features/Admin/"], ["src/Quizymode.Api/Features/Admin/Foo.cs", "src/other.cs"]), ["src/Quizymode.Api/Features/Admin/Foo.cs"]);
  assert.equal(pathsOverlap(["src/Quizymode.Web/src/features/admin/"], ["src/Quizymode.Api/Features/Admin/"]), false);
  assert.equal(pathsOverlap(["src/Quizymode.Api/Features/Admin/"], ["src/Quizymode.Api/Features/Admin/Foo.cs"]), true);
});

// AC 7.19.31: integrator-only globs never make two issues overlap.
test("AC 7.19.31: an ignored (integrator-only) glob never causes an overlap", () => {
  assert.equal(pathsOverlap(["docs/AC.md"], ["docs/AC.md"], new Set(["docs/AC.md"])), false);
});
