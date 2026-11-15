/** Streak milestones (#671): a celebration is shown once per milestone per browser. */
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30];
export const SHOWN_MILESTONES_STORAGE_KEY = "quizymode.streakMilestones.v1";

export function milestoneFor(streak: number): number | null {
  return STREAK_MILESTONES.includes(streak) ? streak : null;
}

export function readShownMilestones(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SHOWN_MILESTONES_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is number => STREAK_MILESTONES.includes(value as number)) : [];
  } catch {
    return [];
  }
}

export function markMilestoneShown(milestone: number): void {
  try {
    const shown = readShownMilestones();
    if (!shown.includes(milestone)) window.localStorage.setItem(SHOWN_MILESTONES_STORAGE_KEY, JSON.stringify([...shown, milestone]));
  } catch {
    /* Storage unavailable: the celebration may repeat, which is harmless. */
  }
}
