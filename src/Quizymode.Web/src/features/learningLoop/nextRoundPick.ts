/**
 * Next 5 / Next 10 pick (#711): unseen items first, then known ones only while unseen items remain. An empty result
 * means no unseen items are left, which the completion screen shows as "You have seen all N".
 */
export function pickNextRound<T extends { id: string }>(
  pool: readonly T[],
  playedIds: ReadonlySet<string>,
  knownIds: ReadonlySet<string>,
  size: number,
): T[] {
  const unplayed = pool.filter((item) => !playedIds.has(item.id));
  const fresh = unplayed.filter((item) => !knownIds.has(item.id));
  if (fresh.length === 0) return [];
  const knownUnplayed = unplayed.filter((item) => knownIds.has(item.id));
  return [...fresh, ...knownUnplayed].slice(0, size);
}
