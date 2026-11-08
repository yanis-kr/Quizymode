import { LEARNING_STATE_CHANGED_EVENT } from "./localLearningState";

/**
 * Browser-local review list for anonymous visitors (#503, AC 3.14.13): `quizymode.review.v1`. It holds public item ids
 * only, oldest first. Signed-in mode ignores this key except for the sign-in claim (claimLocalReviewList). Reads tolerate
 * missing, corrupt, wrong-version or oversized data by returning an empty list and never throw.
 */
export const GUEST_REVIEW_LIST_STORAGE_KEY = "quizymode.review.v1";
export const MAX_GUEST_REVIEW_ITEMS = 100;
const MAX_DOCUMENT_LENGTH = 16 * 1024; // 100 entries of about 86 bytes each, plus overhead
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LocalReviewEntry {
  itemId: string;
  /** ISO timestamp. */
  addedAt: string;
}

/** Valid entries, oldest first, lower-cased and unique. Never throws. */
export function readLocalReviewList(): LocalReviewEntry[] {
  try {
    const raw = window.localStorage.getItem(GUEST_REVIEW_LIST_STORAGE_KEY);
    if (!raw || raw.length > MAX_DOCUMENT_LENGTH) return [];
    const doc = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (!doc || doc.version !== 1 || !Array.isArray(doc.items)) return [];
    const seen = new Set<string>();
    const entries: LocalReviewEntry[] = [];
    for (const entry of doc.items) {
      if (!entry || typeof entry !== "object") continue;
      const { itemId, addedAt } = entry as Record<string, unknown>;
      if (typeof itemId !== "string" || !GUID_PATTERN.test(itemId) || typeof addedAt !== "string") continue;
      const id = itemId.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ itemId: id, addedAt });
      if (entries.length === MAX_GUEST_REVIEW_ITEMS) break;
    }
    return entries;
  } catch {
    return [];
  }
}

function write(entries: LocalReviewEntry[]): boolean {
  try {
    window.localStorage.setItem(GUEST_REVIEW_LIST_STORAGE_KEY, JSON.stringify({ version: 1, items: entries }));
    window.dispatchEvent(new Event(LEARNING_STATE_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds items the visitor missed or marked Still learning. Ids already in the list keep their place. When the cap is
 * reached the oldest entries are dropped. Returns false when the browser refuses the write.
 */
export function addLocalReviewItems(itemIds: readonly string[], now: Date = new Date()): boolean {
  const current = readLocalReviewList();
  const known = new Set(current.map((entry) => entry.itemId));
  const added: LocalReviewEntry[] = [];
  for (const id of itemIds) {
    const lower = id.toLowerCase();
    if (!GUID_PATTERN.test(lower) || known.has(lower)) continue;
    known.add(lower);
    added.push({ itemId: lower, addedAt: now.toISOString() });
  }
  if (added.length === 0) return true;
  return write([...current, ...added].slice(-MAX_GUEST_REVIEW_ITEMS));
}

/** Replaces the whole list (used by the sign-in claim to keep ids that must retry). */
export function replaceLocalReviewList(entries: LocalReviewEntry[]): boolean {
  return write(entries.slice(-MAX_GUEST_REVIEW_ITEMS));
}

/** Removes one item. Returns false when storage could not be written. */
export function removeLocalReviewItem(itemId: string): boolean {
  const id = itemId.toLowerCase();
  return write(readLocalReviewList().filter((entry) => entry.itemId !== id));
}

/** Removes the whole document ("Clear list", or after the sign-in claim has succeeded). */
export function clearLocalReviewList(): void {
  try {
    window.localStorage.removeItem(GUEST_REVIEW_LIST_STORAGE_KEY);
    window.dispatchEvent(new Event(LEARNING_STATE_CHANGED_EVENT));
  } catch {
    // The claim retries on the next page session.
  }
}
