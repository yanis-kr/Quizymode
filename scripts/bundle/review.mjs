// Manifest review record (#761 v2 gap 12, AC 7.19.36). A standing approval needs a review by a fresh reviewer, not by the
// session that approves. The reviewer names its own session id in review.json; this check refuses a record that names no
// reviewer, or that names the approving session. The id is self-declared, so the check catches a mistake, not a lie.
/** Returns the reason the review record cannot approve, or null when it can. */
export function reviewerProblem(review, approvingSession) {
  const id = review?.reviewer?.sessionId;
  if (typeof id !== "string" || !id.trim()) return "review.json must name its reviewer: reviewer.sessionId (the fresh reviewer's session id)";
  if (approvingSession && id === approvingSession) return "review.json was written by the approving session; a fresh reviewer must review the manifest";
  return null;
}
