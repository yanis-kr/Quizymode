/** "new" when the previous window is zero (never an infinite percentage); null when nothing to compare. */
export function formatChange(current: number, previous: number): string | null {
  if (previous === 0) {
    return current === 0 ? null : "new";
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent > 0 ? "+" : ""}${percent}%`;
}
