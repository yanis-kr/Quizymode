export const SWIPE_MIN_DISTANCE_PX = 50;
export const SWIPE_DOMINANCE = 1.5;

export type SwipeDirection = "left" | "right";

/** A swipe is at least 50 px and mostly horizontal; anything else (taps, vertical scrolling) is not a swipe. */
export function classifySwipe(dx: number, dy: number): SwipeDirection | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null;
  if (Math.abs(dx) <= SWIPE_DOMINANCE * Math.abs(dy)) return null;
  return dx > 0 ? "right" : "left";
}
