const celebratedRuns = new Set<string>();

/**
 * One subtle confetti burst for a perfect score (AC 3.19.6). The module loads lazily, only when the visitor has
 * not asked for reduced motion and `matchMedia` exists; any failure is silent. Fires once per run id.
 */
export async function celebratePerfectScore(runId: string): Promise<void> {
  if (celebratedRuns.has(runId)) return;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    celebratedRuns.add(runId);
    const { default: confetti } = await import("canvas-confetti");
    await confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.7 },
      zIndex: 50,
      disableForReducedMotion: true,
    });
  } catch {
    // Celebration is decoration; never surface a failure.
  }
}

/** Test-only: allows the same run id to celebrate again. */
export function resetCelebrationsForTests(): void {
  celebratedRuns.clear();
}
