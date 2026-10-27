import { useEffect, useRef } from "react";

interface BossFightHeaderProps {
  hp: number;
  maxHp: number;
  dueCount: number;
  /** Hits so far; each new hit restarts the shake. */
  hitCount: number;
  /** The last answer's result, shown briefly next to the HP. */
  flash: "hit" | "miss" | null;
}

/** The boss's HP while a boss fight is under way (AC 3.14.12). Focus lands on the heading when the fight starts. */
export function BossFightHeader({ hp, maxHp, dueCount, hitCount, flash }: BossFightHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-red-900 focus:outline-none">
          Boss fight
        </h2>
        <p className="flex items-center gap-2 text-sm font-semibold tabular-nums text-red-900">
          {flash === "hit" && <span className="text-green-800">Hit!</span>}
          {flash === "miss" && <span className="text-gray-700">Missed</span>}
          <span>
            {hp} / {maxHp} HP
          </span>
        </p>
      </div>
      <div
        key={hitCount}
        className={`mt-2 h-3 overflow-hidden rounded-full bg-red-100 ${hitCount > 0 ? "motion-safe:animate-wrong-shake" : ""}`}
      >
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={maxHp}
          aria-valuenow={hp}
          aria-label={`Boss HP ${hp} of ${maxHp}`}
          className="h-full bg-red-600 duration-200 motion-safe:transition-[width]"
          style={{ width: `${maxHp > 0 ? (hp / maxHp) * 100 : 0}%` }}
        />
      </div>
      {dueCount > maxHp && (
        <p className="mt-2 text-xs text-red-800">
          {dueCount} due, fighting {maxHp}
        </p>
      )}
    </div>
  );
}
