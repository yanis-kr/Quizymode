interface GhostTrackProps {
  /** Your progress and the ghost's, in the same unit. */
  yours: number;
  ghost: number;
  /** The progress that fills the track. */
  scale: number;
  /** "Ghost: 4" or "Ghost: 4 of 8". */
  label: string;
}

const percent = (value: number, scale: number): number => Math.min(100, Math.max(0, (value / Math.max(scale, 1)) * 100));

/** A thin progress track with a gray ghost marker. Decorative; the text below it is the readable version. */
export function GhostTrack({ yours, ghost, scale, label }: GhostTrackProps) {
  return (
    <div className="mt-3">
      <div aria-hidden="true" className="relative h-2 rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent(yours, scale)}%` }} />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gray-400"
          style={{ left: `${percent(ghost, scale)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500 tabular-nums">{label}</p>
    </div>
  );
}
