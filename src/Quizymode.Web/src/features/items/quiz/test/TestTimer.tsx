import { ClockIcon } from "@heroicons/react/24/outline";
import { formatDuration } from "./testSetup";

interface TestTimerProps {
  remainingSec: number;
}

/**
 * AC 3.18.6: a timer region that is not live (it would announce every second) plus a separate polite
 * status that changes only at 5:00 and 1:00 left.
 */
export function TestTimer({ remainingSec }: TestTimerProps) {
  const urgent = remainingSec <= 60;
  const warning = !urgent && remainingSec <= 300;
  const style = urgent
    ? "bg-red-50 font-bold text-red-700"
    : warning
      ? "bg-amber-50 font-semibold text-amber-700"
      : "font-semibold text-gray-800";
  const announcement = urgent ? "1 minute left" : warning ? "5 minutes left" : "";

  return (
    <>
      <div role="timer" aria-live="off" className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm tabular-nums ${style}`}>
        {(urgent || warning) && <ClockIcon className="h-4 w-4" aria-hidden="true" />}
        <span>Time left {formatDuration(remainingSec)}</span>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
