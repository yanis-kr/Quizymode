import { interestsApi } from "@/api/learningLoop";
import { homeCategoryCards } from "@/features/home/homePageData";
import { MAX_INTERESTS, clearLocalInterests, readLocalInterests } from "./localLearningState";

const knownCategories = new Set(homeCategoryCards.map((card) => card.slug));

/**
 * After sign-in, merges topics picked anonymously in this browser into the account (#116): the account's existing
 * order first, then new local picks, capped at 10. The local copy is cleared only after the server accepts the merge,
 * so a failure is retried on the next page session. `onMerged` receives the final list just before the local copy is
 * cleared, so callers can seed their cache and avoid a flash of "no topics" (#382). Returns true when the claim succeeded.
 */
export async function claimLocalInterests(onMerged?: (merged: string[]) => void): Promise<boolean> {
  const local = readLocalInterests().filter((slug) => knownCategories.has(slug));
  if (local.length === 0) {
    clearLocalInterests();
    return false;
  }
  try {
    const server = await interestsApi.get();
    const merged = Array.from(new Set([...server, ...local])).slice(0, MAX_INTERESTS);
    if (merged.length !== server.length || merged.some((slug, index) => slug !== server[index])) {
      await interestsApi.replace(merged);
    }
    onMerged?.(merged);
    clearLocalInterests();
    return true;
  } catch {
    return false;
  }
}
