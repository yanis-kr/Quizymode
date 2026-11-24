// Plans the persistent lane and release worktrees a bundle needs (#761 gap 5, AC 7.19.33). Pure: the CLI runs the commands.
// Lanes are detached at origin/main. The release worktree holds release/<bundle id>, created from origin/main when missing.
// A worktree that exists on some other branch is refused, never switched: its owner may have work in it.

/**
 * names: { laneA, laneB, release } worktree folder names from the delivery profile.
 * existing: Map of folder name -> { path, branch } (branch null when detached), read from `git worktree list`.
 * Returns { actions: [{ lane, name, args }], refusals: [reason] }. args are git arguments, without the path.
 */
export function planWorktrees({ names, existing, releaseBranch, releaseBranchExists }) {
  const actions = [];
  const refusals = [];
  for (const lane of ["laneA", "laneB"]) {
    if (!existing.has(names[lane])) actions.push({ lane, name: names[lane], args: ["--detach", "{path}", "origin/main"] });
  }
  const release = existing.get(names.release);
  if (!release) {
    actions.push(releaseBranchExists
      ? { lane: "release", name: names.release, args: ["{path}", releaseBranch] }
      : { lane: "release", name: names.release, args: ["-b", releaseBranch, "{path}", "origin/main"] });
  } else if (release.branch !== releaseBranch) {
    refusals.push(`worktree ${names.release} is on ${release.branch ?? "a detached HEAD"}, not ${releaseBranch}; switch it yourself, the helper never switches a worktree`);
  }
  return { actions, refusals };
}

/** Parses `git worktree list --porcelain` into Map folder name -> { path, branch }. */
export function parseWorktreeList(text) {
  const map = new Map();
  let cur = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const p = line.slice("worktree ".length);
      cur = { path: p, branch: null };
      map.set(p.split(/[\\/]/).pop(), cur);
    } else if (line.startsWith("branch refs/heads/") && cur) {
      cur.branch = line.slice("branch refs/heads/".length);
    }
  }
  return map;
}
