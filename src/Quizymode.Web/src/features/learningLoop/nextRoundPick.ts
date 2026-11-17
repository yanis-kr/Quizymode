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

/** A random sample of `size` items (all of them when there are fewer). Used for collection Play 5 / Play 10 (#714). */
export function sampleRun<T>(items: readonly T[], size: number, random: () => number = Math.random): T[] {
  const sampled = [...items];
  for (let i = sampled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [sampled[i], sampled[j]] = [sampled[j], sampled[i]];
  }
  return sampled.slice(0, size);
}
