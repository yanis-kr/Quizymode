// Path scope for lanes and base-drift checks (#761 gap 8, AC 7.19.31). Pure functions: no git, no file reads.
// An issue's paths are its scope.paths. When none are declared, they are the paths its area labels map to in the delivery
// profile (areaPaths). An issue with neither is unknown: base changes cannot be checked against it, so it is reported as a
// warning instead of as overlapping, and it shares a lane with everything (serial), as before.

/** Glob with forward slashes and no trailing slash. */
export function normGlob(g) { return String(g).replaceAll(String.fromCharCode(92), "/").replace(/\/$/, ""); }

function globToRegex(g) {
  let p = g.replace(/\\/g, "/");
  // A bare file or directory matches itself and everything below it. Escape every regex metacharacter first,
  // including braces and backslashes (CodeQL js/incomplete-sanitization), then add the wildcards and the suffix.
  const bare = !/[*?]/.test(p);
  if (bare) p = p.replace(/\/$/, "");
  const s = p.replace(/[.+^$(){}|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?").replace(/\u0000/g, ".*") + (bare ? "(?:/.*)?" : "");
  return new RegExp(`^${s}$`);
}

function globPrefix(g) {
  const out = [];
  for (const sg of normGlob(g).split("/")) { if (/[*?]/.test(sg)) break; out.push(sg); }
  return out;
}

/** The paths an issue is scoped to, and where they came from: "scope" (declared), "area" (mapped), or "unknown" (neither). */
export function effectivePaths(issue, areaPaths = {}) {
  const declared = Array.isArray(issue?.scope?.paths) ? issue.scope.paths : [];
  if (declared.length) return { paths: declared, source: "scope" };
  const mapped = (Array.isArray(issue?.areas) ? issue.areas : []).flatMap((a) => areaPaths?.[a] ?? []);
  return mapped.length ? { paths: mapped, source: "area" } : { paths: [], source: "unknown" };
}

/** The files that match one of the paths. No paths means no file matches: unknown scope is handled by the caller. */
export function overlappingFiles(paths, files) {
  if (!paths.length) return [];
  const res = paths.map(globToRegex);
  return files.filter((f) => res.some((r) => r.test(f)));
}

/** Whether two path sets may touch the same file, comparing the literal directory prefix of each glob. Ignored globs never count. */
export function pathsOverlap(a, b, ignored = new Set()) {
  if (!a.length || !b.length) return true; // no declared scope: assume overlap, so the issues share a lane
  const fa = a.filter((x) => !ignored.has(normGlob(x)));
  const fb = b.filter((x) => !ignored.has(normGlob(x)));
  for (const x of fa) for (const y of fb) {
    const px = globPrefix(x), py = globPrefix(y);
    const n = Math.min(px.length, py.length);
    if (px.slice(0, n).join("/") === py.slice(0, n).join("/")) return true;
  }
  return false;
}
