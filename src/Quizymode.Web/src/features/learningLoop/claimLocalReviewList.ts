import { isAxiosError } from "axios";
import { reviewQueueApi } from "@/api/learningLoop";
import { clearLocalReviewList, readLocalReviewList, replaceLocalReviewList } from "./localReviewList";

/**
 * After sign-in, moves the browser-local review list into the account (#503, AC 3.14.16). Each id goes through the
 * existing review-queue endpoint in the order it was added. A 404 or 400 drops that id. A 401, 429, network error or 5xx
 * stops the pass and keeps the rest for a later page session. When the pass completes the local key is removed. Silent:
 * no UI. Returns true when at least one item was saved.
 */
export async function claimLocalReviewList(): Promise<boolean> {
  const local = readLocalReviewList();
  if (local.length === 0) return false;

  let saved = false;
  for (let index = 0; index < local.length; index++) {
    try {
      await reviewQueueApi.enqueue(local[index].itemId);
      saved = true;
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 400) continue;
      replaceLocalReviewList(local.slice(index));
      return saved;
    }
  }

  clearLocalReviewList();
  return saved;
}
