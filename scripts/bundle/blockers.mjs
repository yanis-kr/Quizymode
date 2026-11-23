// Blocker records in state.json (#761, AC 7.19.27). A blocker is never removed: resolving one sets resolvedAt and
// resolution, so the run keeps its history and status shows only the open ones. Pure functions; bundle.mjs does the
// reads and writes.

/** The unresolved blockers, each with its index in the full list (the index is what `blocker --resolve` takes). */
export function openBlockers(blockers = []) {
  return blockers.map((b, index) => ({ ...b, index })).filter((b) => !b.resolvedAt);
}

/**
 * Resolves blockers[index] with a note. Returns { error } for a bad index, a missing note or an already resolved blocker
 * (with resolvedAt when that is the reason). Otherwise returns { blockers } with the record marked resolved; the input is
 * not mutated.
 */
export function resolveBlocker(blockers, index, note, at) {
  if (!Number.isInteger(index) || index < 0 || index >= blockers.length) return { error: `--resolve must be a blocker index (0 to ${blockers.length - 1})` };
  if (typeof note !== "string" || !note.trim()) return { error: "--note is required when resolving (what changed, no secrets)" };
  const b = blockers[index];
  if (b.resolvedAt) return { error: `Blocker ${index} is already resolved.`, resolvedAt: b.resolvedAt };
  return { blockers: blockers.map((x, i) => (i === index ? { ...x, resolvedAt: at, resolution: note } : x)) };
}
