import { useEffect, useState } from "react";
import { markMilestoneShown, milestoneFor, readShownMilestones } from "./streakMilestones";

/** Shows a short celebration the first time this browser reaches a streak milestone (3, 7, 14, 30 days). */
export function StreakMilestoneCelebration({ streak }: { streak: number }) {
  const [milestone] = useState<number | null>(() => {
    const reached = milestoneFor(streak);
    return reached !== null && !readShownMilestones().includes(reached) ? reached : null;
  });
  useEffect(() => {
    if (milestone !== null) markMilestoneShown(milestone);
  }, [milestone]);
  if (milestone === null) return null;
  return (
    <p role="status" className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
      🎉 {milestone}-day streak milestone! Keep it going.
    </p>
  );
}
