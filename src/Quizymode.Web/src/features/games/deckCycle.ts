import { seededShuffle } from "@/features/items/learn/learnRun";

/**
 * Order of one pass over the deck. Every id appears once per cycle, the same run id and cycle always give the same
 * order, and the first card of a new cycle is never the last card of the previous one.
 */
export function cycleOrder(
  ids: readonly string[],
  runId: string,
  cycle: number,
  previousLastId: string | null,
): string[] {
  const order: string[] = seededShuffle(ids, `${runId}:cycle:${cycle}`);
  if (order.length > 1 && previousLastId !== null && order[0] === previousLastId) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}
