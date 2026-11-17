import { buildScopeStudyHref, withQuizSize } from "@/utils/scopeStudyHref";

/** A 5-question quiz for one set. The scope keeps its navigation keywords, so the link never drops to a bare category. */
export function quizPathForScope(scope: string): string {
  const [category, ...nav] = scope.split("/");
  return withQuizSize(buildScopeStudyHref("quiz", category, nav), 5);
}
