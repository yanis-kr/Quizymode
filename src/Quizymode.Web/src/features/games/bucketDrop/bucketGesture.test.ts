import { describe, expect, it } from "vitest";
import { classifyBucketSwipe } from "./bucketGesture";

describe("classifyBucketSwipe", () => {
  it("maps left, down and right to buckets 1, 2 and 3", () => {
    expect(classifyBucketSwipe(-80, 5)).toBe(1);
    expect(classifyBucketSwipe(10, 90)).toBe(2);
    expect(classifyBucketSwipe(80, -5)).toBe(3);
  });

  it("ignores short moves, upward swipes and diagonals", () => {
    expect(classifyBucketSwipe(-49, 0)).toBeNull();
    expect(classifyBucketSwipe(0, 49)).toBeNull();
    expect(classifyBucketSwipe(0, -120)).toBeNull();
    expect(classifyBucketSwipe(70, 70)).toBeNull();
    expect(classifyBucketSwipe(0, 0)).toBeNull();
  });
});
