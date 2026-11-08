import { beforeEach, describe, expect, it } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  GUEST_REVIEW_LIST_STORAGE_KEY,
  MAX_GUEST_REVIEW_ITEMS,
  addLocalReviewItems,
  clearLocalReviewList,
  readLocalReviewList,
  removeLocalReviewItem,
} from "./localReviewList";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

describe("guest review list storage (AC 3.14.13)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("stores lower-cased, unique ids in the order they were added and ignores invalid ids", () => {
    addLocalReviewItems([id(1).toUpperCase(), "not-a-guid", id(2)]);
    addLocalReviewItems([id(1)]);
    expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([id(1), id(2)]);
  });

  it("drops the oldest entries at the cap", () => {
    addLocalReviewItems(Array.from({ length: MAX_GUEST_REVIEW_ITEMS }, (_, n) => id(n + 1)));
    addLocalReviewItems([id(999)]);
    const ids = readLocalReviewList().map((entry) => entry.itemId);
    expect(ids).toHaveLength(MAX_GUEST_REVIEW_ITEMS);
    expect(ids[0]).toBe(id(2));
    expect(ids[ids.length - 1]).toBe(id(999));
  });

  it("reads corrupt, wrong-version and oversized data as empty or partial, never throwing", () => {
    window.localStorage.setItem(GUEST_REVIEW_LIST_STORAGE_KEY, "{not json");
    expect(readLocalReviewList()).toEqual([]);
    window.localStorage.setItem(GUEST_REVIEW_LIST_STORAGE_KEY, JSON.stringify({ version: 2, items: [] }));
    expect(readLocalReviewList()).toEqual([]);
    window.localStorage.setItem(
      GUEST_REVIEW_LIST_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ itemId: id(1), addedAt: "2026-11-08T00:00:00.000Z" }, { itemId: 7 }] }),
    );
    expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([id(1)]);
    window.localStorage.setItem(GUEST_REVIEW_LIST_STORAGE_KEY, "x".repeat(17 * 1024));
    expect(readLocalReviewList()).toEqual([]);
  });

  it("removes one item and clears the whole list", () => {
    addLocalReviewItems([id(1), id(2)]);
    expect(removeLocalReviewItem(id(1))).toBe(true);
    expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([id(2)]);
    clearLocalReviewList();
    expect(window.localStorage.getItem(GUEST_REVIEW_LIST_STORAGE_KEY)).toBeNull();
  });
});
