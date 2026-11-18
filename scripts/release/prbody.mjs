// The release PR body (AC 7.19.9). Lists exactly the bundled issues as `Refs #n` so a merge cannot close them before the
// ship run has validated each one. Excluded issues are listed with the reason.

const CLOSING = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s+#\d+/i;

/** Builds the body. issues: [{ number, title }]; excluded: [{ number, reason }]. */
export function releasePrBody({ bundleId, issues, excluded = [] }) {
  const lines = [
    `Release bundle \`${bundleId}\`. Each issue is closed by the ship run after its production validation, not by this merge.`,
    "",
    "## Issues in this release",
    ...issues.map((i) => `Refs #${i.number} ${i.title}`),
  ];
  if (excluded.length) {
    lines.push("", "## Excluded from this release", ...excluded.map((e) => `- #${e.number}: ${e.reason}`));
  }
  return lines.join("\n") + "\n";
}

/** Throws if the body would close an issue on merge. Used before the PR is created or edited. */
export function assertNoClosingKeywords(body) {
  const hit = body.split("\n").find((line) => CLOSING.test(line));
  if (hit) throw new Error(`release PR body closes an issue on merge: "${hit.trim()}"`);
  return true;
}
