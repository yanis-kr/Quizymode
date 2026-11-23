// Batch selection (#761 v2, design B). Pure: takes candidate issues and returns the batch, one exclusion reason per
// excluded issue, the conflicts between picked issues, and the lane split. bundle.mjs select reads the input and writes nothing.
import fs from "node:fs";
import path from "node:path";

const SIZE_ORDER = ["xs", "s", "m", "l"];
const PRIORITY_ORDER = { "priority:high": 0, "priority:med": 1, "priority:low": 2 };
const HOLD_LABELS = ["status:deferred", "status:needs-refinement", "status:blocked"];
const TERMINAL_PHASES = new Set(["done", "done_partial", "blocked_terminal", "cancelled"]);

const labelNames = (c) => (c.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const sizeOf = (labels) => {
  const s = labels.find((l) => l.startsWith("size:"));
  return s ? s.slice("size:".length) : null;
};

// Literal directory prefix of a glob (segments before the first wildcard), as bundle.mjs computes it.
function globPrefix(g) {
  const out = [];
  for (const seg of String(g).replaceAll("\\", "/").replace(/\/$/, "").split("/")) {
    if (/[*?]/.test(seg)) break;
    out.push(seg);
  }
  return out;
}
// Conservative: two scopes overlap when their literal prefixes agree on the shorter length.
export function scopesOverlap(a, b) {
  if (!a.length || !b.length) return true; // no declared scope: it conflicts with everything (design B.4)
  for (const x of a) for (const y of b) {
    const px = globPrefix(x), py = globPrefix(y);
    const n = Math.min(px.length, py.length);
    if (px.slice(0, n).join("/") === py.slice(0, n).join("/")) return true;
  }
  return false;
}

// Why a candidate cannot join this batch, or null when it can.
function exclusionReason(c, labels, { maxSize, excludeAreas, locked }) {
  if (!labels.includes("status:ready")) return "no status:ready label";
  const hold = HOLD_LABELS.find((h) => labels.includes(h));
  if (hold) return `${hold} label`;
  if (labels.some((l) => l.startsWith("bundle:"))) return "already claimed by a bundle";
  if (locked.has(c.number)) return "in a running or validating bundle";
  if ((labels.includes("parked") || labels.includes("validation-failed")) && !labels.includes("fix-forward")) return "parked or failed validation";
  if (c.hasAcs === false) return "no acceptance criteria";
  const size = sizeOf(labels);
  if (!size) return "no size label";
  if (!SIZE_ORDER.includes(size)) return `unknown size:${size}`;
  if (SIZE_ORDER.indexOf(size) > SIZE_ORDER.indexOf(maxSize)) return `size:${size} is over the envelope maximum size:${maxSize}`;
  const area = labels.find((l) => l.startsWith("area:") && excludeAreas.includes(l));
  if (area) return `${area} is excluded by the envelope`;
  return null;
}

function rankKey(c) {
  const p = PRIORITY_ORDER[c.labels.find((l) => l in PRIORITY_ORDER)] ?? 3;
  const s = SIZE_ORDER.indexOf(sizeOf(c.labels));
  return [p, s, c.number];
}
const byRank = (x, y) => {
  const a = rankKey(x), b = rankKey(y);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

// Pairwise conflicts among the picked issues (design B.3). Returns [{ a, b, reason }].
export function pairConflicts(picked) {
  const out = [];
  for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
    const x = picked[i], y = picked[j];
    if ((x.dependsOn ?? []).includes(y.number) || (y.dependsOn ?? []).includes(x.number)) out.push({ a: x.number, b: y.number, reason: "dependsOn link" });
    else if (x.migration && y.migration) out.push({ a: x.number, b: y.number, reason: "both add a migration" });
    else if (scopesOverlap(x.paths ?? [], y.paths ?? [])) out.push({ a: x.number, b: y.number, reason: "scope paths overlap or are unknown" });
  }
  return out;
}

// Conflicting issues share a lane, in rank order (design B.3). Groups go to the lighter lane, biggest group first.
export function assignLanes(picked, conflicts) {
  const parent = new Map(picked.map((c) => [c.number, c.number]));
  const find = (n) => (parent.get(n) === n ? n : find(parent.get(n)));
  for (const { a, b } of conflicts) parent.set(find(a), find(b));
  const groups = new Map();
  for (const c of picked) {
    const root = find(c.number);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }
  const lanes = { a: [], b: [] };
  for (const g of [...groups.values()].sort((x, y) => y.length - x.length || x[0].number - y[0].number)) {
    const lane = lanes.a.length <= lanes.b.length ? "a" : "b";
    lanes[lane].push(...g);
  }
  const laneOf = new Map();
  for (const [lane, list] of Object.entries(lanes)) for (const c of list) laneOf.set(c.number, lane);
  return { laneOf, groupSizes: [...groups.values()].map((g) => g.length) };
}

// Selects one batch. Options: maxIssues (default 8), maxSize (default "m"), excludeAreas (e.g. ["area:auth"]), locked (Set of issue numbers).
export function selectIssues(candidates, { maxIssues = 8, maxSize = "m", excludeAreas = ["area:auth", "area:infra"], locked = new Set() } = {}) {
  const excluded = [];
  const eligible = [];
  for (const raw of candidates) {
    const c = { ...raw, labels: labelNames(raw) };
    const reason = exclusionReason(c, c.labels, { maxSize, excludeAreas, locked });
    if (reason) excluded.push({ number: c.number, reason });
    else eligible.push(c);
  }
  eligible.sort(byRank);
  const picked = eligible.slice(0, maxIssues);
  eligible.slice(maxIssues).forEach((c, i) => excluded.push({ number: c.number, reason: `rank ${maxIssues + i + 1}: the batch holds ${maxIssues}` }));
  const conflicts = pairConflicts(picked);
  const { laneOf, groupSizes } = assignLanes(picked, conflicts);
  const warnings = [];
  const biggest = Math.max(0, ...groupSizes);
  if (picked.length > 1 && biggest * 2 > picked.length) warnings.push(`one lane group holds ${biggest} of ${picked.length} issues; consider swapping the lowest-ranked member (design B.3)`);
  const selected = picked.map((c, i) => ({ number: c.number, rank: i + 1, lane: laneOf.get(c.number), reason: [c.labels.find((l) => l in PRIORITY_ORDER), sizeOf(c.labels) && `size:${sizeOf(c.labels)}`].filter(Boolean).join(", ") || "no priority label" }));
  return { selected, excluded, conflicts, warnings };
}

// Issue numbers held by bundles that are not terminal. Such an issue is excluded even when its label was lost (design B.1).
export function lockedIssues(bundlesDir) {
  const locked = new Set();
  if (!bundlesDir || !fs.existsSync(bundlesDir)) return locked;
  for (const dir of fs.readdirSync(bundlesDir)) {
    const file = path.join(bundlesDir, dir, "state.json");
    if (!fs.existsSync(file)) continue;
    let st;
    try { st = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    if (TERMINAL_PHASES.has(st.phase)) continue;
    for (const n of Object.keys(st.issues ?? {})) locked.add(Number(n));
  }
  return locked;
}
