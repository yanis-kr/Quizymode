// The owner's approval reply for a bundle manifest (#761, AC 7.19.16). Two forms are accepted, and both bind to the hash the
// owner was shown in the brief:
//   "approve <hash prefix>"  the refine session's reply
//   "start autopilot"        the owner's go after the refined issues were picked up together as one bundle
// An "ok" to a question, or any text without one of these, is not an approval. A reply that names a different hash is refused.

/**
 * Returns { ok: true, kind: "approve" | "start-autopilot" } or { ok: false, reason }. Pure: no I/O.
 */
export function checkUserReply({ reply, given }) {
  const text = typeof reply === "string" ? reply.trim() : "";
  if (!text) return { ok: false, reason: "--user-reply \"<verbatim user approval text>\" is required" };
  const hash = String(given ?? "").toLowerCase();
  if (hash.length < 8 || !/^[0-9a-f]+$/.test(hash)) return { ok: false, reason: "--hash must be the 8-character prefix the owner was shown" };
  const named = (text.match(/\bapprove\s+([0-9a-f]{8,64})\b/i) ?? [])[1];
  if (named) {
    if (named.toLowerCase() !== hash) return { ok: false, reason: "The reply names a different hash than --hash; the owner approves the revision that was shown." };
    return { ok: true, kind: "approve" };
  }
  if (/\bstart\s+autopilot\b/i.test(text)) return { ok: true, kind: "start-autopilot" };
  return { ok: false, reason: "The user's reply must contain 'approve <hash prefix>' matching --hash, or 'start autopilot'. An 'ok' to questions is not an approval." };
}
