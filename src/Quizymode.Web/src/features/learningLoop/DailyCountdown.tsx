import { useDailyCountdown } from "@/hooks/useDailyCountdown";

interface DailyCountdownProps {
  /** The server's quiz date (YYYY-MM-DD); the next quiz starts at 00:00 UTC the day after. */
  quizDate?: string | undefined;
  /** Resets the page to the start state and refetches today's set. Only ever called by the button, never automatically. */
  onPlayToday: () => void;
  /** "panel" is the gray box on the result screen; "inline" is a sentence for the done card. */
  variant: "panel" | "inline";
  /** Inline only: copy that follows "Next daily quiz in ...". */
  trailing?: string;
}

/**
 * "Next daily quiz in 5 h 12 min" (#649). The ticker is not a live region (a per-minute change would chatter); the
 * permanently mounted wrapper announces only the switch to the ready state, which offers "Play today's quiz".
 */
export function DailyCountdown({ quizDate, onPlayToday, variant, trailing }: DailyCountdownProps) {
  const { text, isReady } = useDailyCountdown(quizDate);
  const isPanel = variant === "panel";
  return (
    <div className={isPanel ? "mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700" : "mt-1 text-sm text-emerald-800"}>
      {!isReady && (
        <p>
          Next daily quiz in {text}.{trailing ? ` ${trailing}` : ""}
        </p>
      )}
      <div role="status">
        {isReady && (
          <>
            <p className="font-semibold">A new daily quiz is ready.</p>
            <button
              type="button"
              onClick={onPlayToday}
              className="mt-2 min-h-[44px] rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Play today's quiz
            </button>
          </>
        )}
      </div>
    </div>
  );
}
