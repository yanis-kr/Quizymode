import { SWIPE_DOMINANCE, SWIPE_MIN_DISTANCE_PX } from "../swipeBlitz/swipeGesture";

/** Bucket number: 1 = swipe left, 2 = swipe down, 3 = swipe right. */
export type BucketNumber = 1 | 2 | 3;

/** A swipe is at least 50 px and clearly along one axis. Up, diagonals and taps are not swipes. */
export function classifyBucketSwipe(dx: number, dy: number): BucketNumber | null {
  const absX: number = Math.abs(dx);
  const absY: number = Math.abs(dy);
  if (absX >= SWIPE_MIN_DISTANCE_PX && absX > SWIPE_DOMINANCE * absY) return dx > 0 ? 3 : 1;
  if (dy >= SWIPE_MIN_DISTANCE_PX && absY > SWIPE_DOMINANCE * absX) return 2;
  return null;
}
