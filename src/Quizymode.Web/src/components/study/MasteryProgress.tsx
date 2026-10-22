interface MasteryProgressProps {
  mastered: number;
  total: number;
  /** Set when a larger collection is capped, e.g. "Learning 50 of 83". */
  caption?: string | null;
}

/** "Mastered N of M" bar for Learn (AC 3.17.6). */
export function MasteryProgress({ mastered, total, caption }: MasteryProgressProps) {
  const label = `Mastered ${mastered} of ${total}`;
  const percent = total === 0 ? 0 : Math.round((mastered / total) * 100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-gray-700">
        <span>{label}</span>
        {caption && <span className="text-xs text-gray-500">{caption}</span>}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={mastered}
        aria-label={label}
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className="h-full rounded-full bg-green-600 motion-safe:transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
